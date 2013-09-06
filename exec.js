var _exec        = require('child_process').exec;
var EventEmitter = require('events').EventEmitter;
var PassThrough  = require('stream').PassThrough;

module.exports = exec;

function exec(cmd, cb) {
  var child = new EventEmitter();
  child.stdout = new PassThrough({encoding: 'utf8'});
  child.stderr = new PassThrough({encoding: 'utf8'});

  findParentAddress(function(err, parent) {
   if (err) return cb(err);
    cmd = 'ssh ' + parent + ' "' + cmd + '"';
    console.log('executing %s', cmd);
    var _child = _exec(cmd, cb);
    _child.stdout.pipe(child.stdout);
    _child.stderr.pipe(child.stderr);
    child.pid = _child.pid;
    _child.once('exit', function() {
      child.emit('exit');
    });
  });

  return child;
}

function findParentAddress(cb) {
  _exec('mdata-get parent', function(err, stdout) {
    if (err) return cb (err);
    var parent = stdout.trim();
    if (! parent) cb(new Error('no parent defined in zone metadata'));
    else cb (null, parent);
  });
}

function escape(cmd) {
  return cmd.replace(/\'/, '\\\'');
}
