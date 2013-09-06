require('colors');
var _exec  = require('./exec');
var _spawn = require('./spawn');
var _copy   = require('./copy');
var log    = console.log;

module.exports = Zone;

function Zone(uuid) {
  this.uuid = uuid;
  this.spawns = {};
  this.log = function(w) {
    if (! w) w = '';
    w = '[' + this.uuid + ']: ' + w;
    arguments[0] = w;
    log.apply(null, arguments);
  }
}

var Z = Zone.prototype;

Z.execUnprivileged = function execUnprivileged(cmd, cb) {
  cmd = 'sudo -u nobody \\\"sh -c \'' + cmd + '\'\\\"';
  return this.exec(cmd, cb);
};

Z.exec = function exec(cmd, cb) {
  var self = this;
  cmd = 'zlogin ' + this.uuid + ' ' + cmd;
  this.log('executing command %j'.green, cmd);
  return _exec(cmd, cb);

	function onExecDone(err) {
    self.log('execution result:'.green, err && err.message);
  }
};

Z.copy = function copy(sourcePath, destPath, cb) {
  _copy(sourcePath, this.uuid, destPath, cb);
}

Z.spawn = function spawn(name, cmd, args) {
  this.log('spawning %s, cmd = %j', name, cmd, args);
  if (this.spawns[name]) throw new Error('already spawned ' + name);

  cmd = 'zlogin ' + this.uuid + ' ' + cmd;

  var child = _spawn(cmd, args);
  this.spawns[name] = child;
  child.on('exit', onExit.bind(this, name));

  return child;
};

Z.kill = function kill(name, cb) {
  var child = this.spawns[name];
  if (child) {
    if (cb) child.once('exit', cb);
    child.kill();
  } else process.nextTick(cb);
}

function onExit(name) {
  delete this.spawns[name]; 
}

/// Utils

function escape(cmd) {
  return cmd.replace(/\'/, '\\\'');
}
