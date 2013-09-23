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
    execute(__dirname + '/repo/' + root, script);
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
  console.log('executing', options);
  console.log('script: `', script + '`');

  var child = spawn('bash', ['-c', script], options);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', console.log);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', console.log);

  var out = fs.createWriteStream('stdout.out');
  out.write('\n$ ' + script + '\n');
  child.stdout.pipe(out);

  var err = fs.createWriteStream('stderr.out');
  child.stderr.pipe(out);

  child.once('exit', function(code) {
    console.log('child exited with code')
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
