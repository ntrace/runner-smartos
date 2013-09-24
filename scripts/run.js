#!/usr/bin/env node

var exec   = require('child_process').exec;
var spawn  = require('child_process').spawn;
var assert = require('assert');
var fs     = require('fs');
var extend = require('util')._extend;


findRepoRoot(function(err, root) {
  if (err) throw err;
  findScript(root, function(err, script) {
    if (err) throw err;
    execute(__dirname + '/repo/' + root, '../../dtrace.sh "' + script + '"');
  });
});


function execute(dir, script) {
  var env     = extend({}, process.env);
  env.PATH    = './node_modules/.bin:' + process.env.PATH;
  env.NTRACE  = 'true';

  var options = {
    cwd: dir,
    env: env
  };

  var child = spawn('bash', ['-c', script], options);

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  child.once('exit', function(code) {
    process.exit(code);
  });
}

function findRepoRoot(cb) {
  exec('ls -1 repo', onCmd);

  function onCmd(err, stdout) {
    if (err) cb(err);
    else {
      var files = stdout.trim().split('\n');
      assert.equal(files.length, 2, 'expected 2 files in repo, but have these:' + stdout);
      files = files.filter(function(f) { return f != 'repo.tgz'; });
      assert.equal(files.length, 1);
      cb(null, files[0]);
    }
  }
}

function findScript(packagePath, cb) {
  var cmd = 'cat repo/' + packagePath + '/package.json';
  exec(cmd, onExec);

  function onExec(err, package) {
    if (err) cb (err);
    else {
      try {
        package = JSON.parse(package);
      } catch (err) {
        err.message = 'Error parsing package.json: ' + err.message;
        cb(err);
      }
      var script = package.scripts && package.scripts.benchmark || package.scripts.benchmarks || package.scripts.test;
      cb(null, script);
    }
  }
}
