require('colors');
var assert = require('assert');
var exec   = require('./exec');
var async  = require('async');
var fs     = require('fs');
var _spawn = require('child_process').spawn;
var Duplex = require('stream').Duplex;
var genUid = require('node-uuid').v4;
var Zone   = require('./zone');
var Queue  = require('./out_queue');
var log    = console.log;

module.exports = run;

function run(uuid, owner, repo, commit, cb) {

  var repoURL = 'https://github.com/' + owner + '/' + repo;
  var zone = new Zone(uuid);

  var runId = genUid();
  var queue = Queue.out(owner, repo, commit, runId);

  zone.result = queue('result')
  zone.stdout = queue('stdout');
  zone.stderr = queue('stderr');
  zone.events = queue('events');

  var logPrefix = '[' + runId + '] ';
  zone.log = function(o) {
    if (! o) o = '';
    o = logPrefix + o;
    arguments[0] = 0;
    log.apply(null, arguments);
  }


  var startTime = new Date();

  zone.events.write({level:'info', code: 'start', message: 'starting'});

  async.series([
    prepare            .bind(null, zone),
    downloadRepo       .bind(null, zone, repoURL, commit),
    installRepo        .bind(null, zone, repoURL),
    placeDtrace        .bind(null, zone),
    startDtrace        .bind(null, zone)
  ], allDone);


  function allDone(err) {
    if (err) zone.events.write({level: 'error', message: err.message, stack: err.stack});
    var ellapsedTime = Math.round((Date.now() - startTime) / 1000);
    zone.events.write({level: 'info', code: 'finish', message: 'finished after ' + ellapsedTime + ' seconds'});

    zone.result.end();
    zone.events.end();

    zone.stdout.end();
    zone.stderr.end();
    zone.events.end();
    cb(err);

  }
}

function prepare(zone, cb) {
  log('preparing zone %s'.yellow, zone.uuid);
  zone.events.write({level: 'info', message: 'preparing worker ' + zone.uuid});
  seq(zone, [
      ['mkdir -p repo'],
      ['mkdir -p .npm'],
      ['chown -R nobody.nobody .'],
      ['npm config set cache /root/.npm'],
      ['npm --global config set cache /root/.npm'],
      ['npm --global config set color always']
    ], cb);
}

function downloadRepo(zone, repo, commit, cb) {
  log('about to download repo'.yellow);
  var downloadURL = repo + '/archive/' + commit + '.tar.gz';
  zone.events.write({level: 'info', message: 'downloading repo from ' + downloadURL});
  seq(zone, [
      'curl -sSLk ' + downloadURL + ' -o repo/repo.tgz',
      'tar xvfz repo/repo.tgz -C repo'
    ], done, true);

  function done(err) {
    if (err) zone.events.write({level: 'error', message: 'repo download failed'});
    else zone.events.write({level: 'info', message: 'repo download finished'});
    cb(err);
  }
}

function installRepo(zone, repo, cb) {
  findRepoRoot(zone, repoRootFound);

	function repoRootFound(err, repoRoot) {
    if (err) cb (err);
    else {
      if (! repoRoot) cb(new Error('no repo root found'));
      else install(repoRoot);
    }
  }

  function install(repoRoot) {
    zone.events.write({level: 'info', message: 'installing NPM dependencies'});
    var cmd = 'cd repo/' + repoRoot + '; npm install';
    zone.stdout.write('\n$ ' + cmd + '\n\n');
    pipeChild(zone, zone.execUnprivileged(cmd, cb));

    function installed(err) {
      if (err) err.user = true;
      cb(err);
    }
  }
}


function placeDtrace(zone, cb) {
  zone.events.write({level: 'trace', message: 'placing DTrace scripts'});
  async.series([
    zone.copy.bind (zone, __dirname + '/scripts/dtrace.sh', '/root/dtrace.sh'),
    zone.copy.bind (zone, __dirname + '/scripts/run.js', '/root/run.js'),
    zone.exec.bind(zone, 'chmod +x dtrace.sh run.js')
  ], cb);
}


function startDtrace(zone, cb) {
  zone.events.write({level: 'trace', message: 'starting DTrace script'});

	var calledback = false;
  function callback() {
    if (! calledback) {
      calledback = true;
      cb.apply(null, arguments);
    }
  }

  log('about to start dtrace'.yellow);

  var cmd = '/root/run.js';

  var dtrace = zone.__dtrace = zone.spawn('dtrace', cmd, []);
  dtrace.once('error', callback);

  dtrace.stdout.pipe(zone.result);

  dtrace.once('exit', function() {
    log('dtrace exited'.yellow);
    zone.events.write({level:'trace', message: 'DTrace script finished'});
    callback();
  });
}

/// Utils

function findRepoRoot(zone, cb) {
  if (zone.__repo_root) return cb(null, zone.__repo_root);
  var cmd = 'ls -1 repo';
  zone.execUnprivileged(cmd, onCmd);

  function onCmd(err, stdout) {
    if (err) cb(err);
    else {
      var files = stdout.trim().split('\n');
      assert.equal(files.length, 2, 'expected 2 files in repo, but have these:' + stdout);
      files = files.filter(function(f) { return f != 'repo.tgz'; });
      assert.equal(files.length, 1);
      zone.__repo_root = files[0];
      cb(err, files[0]);
    }
  }
}

function findScript(zone, packagePath, cb) {
  if (zone.__script) return cb(null, zone.__script);
  var cmd = 'cat repo/' + packagePath + '/package.json';
  zone.execUnprivileged(cmd, onExec);

	function onExec(err, package) {
    if (err) cb (err);
    else {
      try {
        package = JSON.parse(package);
      } catch (err) {
        err.message = 'Error parsing package.json: ' + err.message;
        cb(err);
      }
      /// TODO: default to other scripts
      var script = package.scripts && package.scripts.test;
      zone.__script = script;
      cb(null, script);
    }
  }
}


function seq(zone, commands, cb, output) {
  assert(Array.isArray(commands), 'commands need to be array');
  var functions = commands.map(commandToFunction);
	async.series(functions, cb);

	function commandToFunction(cmd) {
    var privileged = false;
    if (Array.isArray(cmd)) {
      assert.equal(cmd.length, 1, 'privileged command must be 1 in length');
      privileged = true;
      cmd = cmd[0];
    }
    return function(cb) {
      if (output) zone.stdout.write('\n$ ' + cmd + '\n\n');
      pipeChild(zone, privileged ? zone.exec(cmd, cb) : zone.execUnprivileged(cmd, cb));
    };
  }
}


function pipeChild(zone, child) {
  child.stdout.pipe(zone.stdout, {end: false});
  child.stderr.pipe(zone.stderr, {end: false});
}
