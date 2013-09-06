require('colors');
var _spawn       = require('child_process').spawn;
var _exec        = require('child_process').exec;
var EventEmitter = require('events').EventEmitter;
var PassThrough  = require('stream').PassThrough;

module.exports = exec;

function exec(cmd, args) {
  var stop = false;
  var child = new EventEmitter();
  child.stdout = new PassThrough({encoding: 'utf8'});
  child.stderr = new PassThrough({encoding: 'utf8'});
  child.kill = function() {
    stop = true;
    process.nextTick(function() { child.emit('exit'); });
  }

  findParentAddress(function(err, parent) {
    if (err) throw err;
    if (stop) return;
    console.log('executing %s', cmd, args);
    cmd = cmd + args.join(' ');

    var _child = _spawn('ssh', [parent,  cmd]);

    _child.stderr.setEncoding('utf8');
    _child.stderr.on('data', function(d) {
      console.error('[spawned ' + cmd + ' stderr]:', d);
    });

    _child.stdout.pipe(child.stdout);
    _child.stderr.pipe(child.stderr);
    child.pid = _child.pid;
    _child.once('exit', function() {
      child.emit('exit');
    });
    child.kill = function(sig) {
      _child.kill(sig);
    };
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
