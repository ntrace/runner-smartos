var EventEmitter = require('events').EventEmitter;
var db           = require('./db');
var workersDB    = db.sublevel('workers');
var availableDB  = db.sublevel('available');
var cleaningDB   = db.sublevel('cleaning');
var defunktDB    = db.sublevel('defunkt');
var log          = console.log;
var run          = require('./run');
var _exec        = require('./exec');

(function init() {
  workersDB.createReadStream().on('data', onWorker);

  function onWorker(rec) {
    var uuid = rec.key;
    enroll(uuid, defaultCallback);
  }
}());


exports = module.exports = new EventEmitter();
var internal = new EventEmitter();

var workers     = {};
var available   = [];
var queue       = [];


/// next

exports.workers = workers;

exports.next    = next;

function next(cb) {
  if (available.length) cb(null, available.shift());
  else queue.push(cb);
}

internal.on('available', function() {
  if (queue.length) next(queue.shift());
  else exports.emit('available');
});


/// available

exports.available = getAvailable;
function getAvailable() {
  return available.length;
}


/// enroll

exports.enroll = enroll;

function enroll(uuid, cb) {
  log('enrolling', uuid);
  workersDB.put(uuid, uuid, onPut);

  function onPut(err) {
    if (err) cb(err);
    else {
      var w = new Worker(uuid);
      clean(w);
      cb();
    }
  }
}


/// expell

exports.expel = expel;

function expel(uuid, cb) {
  log('expelling', uuid);
  db.batch([
    {key: uuid, value: uuid, type: 'del', prefix: workersDB},
    {key: uuid, value: uuid, type: 'del', prefix: availableDB}
  ], onDel);

  function onDel(err) {
    if (err) cb(err);
    else {
      var worker = workers[uuid];
      if (worker) {
        delete workers[uuid];
        var idx = available.indexOf(worker);
        if (idx >= 0) available.splice(idx, 1);
        cb();
      }
    }
  }
}


function makeAvailable(worker) {
  if (available.indexOf(worker) < 0) {
    available.push(worker);
  }
  internal.emit('available');
}


/// clean

function clean(worker) {
  var uuid = worker.uuid;

  if (process.env.FAKE_RUN) {
    process.nextTick(onRolledBack);
  } else {
    var cmd = 'vmadm rollback-snapshot ' + uuid + ' clean';
    _exec(cmd, onRolledBack);
  }

  function onRolledBack(err) {
    if (err) {
      err.message = 'Error cleaning up vm ' + uuid + ':' + err.message;
      console.log(err.stack);
      console.error('adding ' + uuid + ' to the defunkt worker db');
      defunktDB.put(uuid, uuid);
    } else {
      availableDB.put(uuid, uuid, onPut);

      function onPut(err) {
        if (err) throw err;

        workers[uuid] = worker;

				/// wait some time before making this worker available
				setTimeout(function() {
          makeAvailable(worker);
       }, 10000);
      }
    }
  }
}


/// Worker

function Worker(uuid) {
  this.uuid = uuid;
}

var W = Worker.prototype;

W.run = function(owner, repo, commit, cb) {
  repoURL = 'https://github.com/' + owner + '/' + repo;
  log('worker %s is about to run %s#%s', this.uuid, repoURL, commit);

  if (process.env.FAKE_RUN) {
    return process.nextTick(function() {
      clean(this);
      cb();
    }.bind(this));
  }

  if (workers[this.uuid] != this) throw new Error('Worker is not available');

  availableDB.del(this.uuid, onDel.bind(this));

  function onDel(err) {
    if (err) cb(err);
    else {
      run(this.uuid, owner, repo, commit, ran.bind(this));

      function ran(err) {
        if (! err) log('worker %s finished running %s#%s', this.uuid, repo, commit);
        if (err) error(err);
        if (workers[this.uuid]) {
          clean(this);
          cb(err);
        } else cb(err);
      }
    }
  }

  var error = function (err) {
    console.error('worker %s had error running %s#%s: %s.\nStack:', this.uuid, repo, commit, err.message.trim());
    console.error('-------');
    console.error(err.stack);
    console.error('-------');
  }.bind(this);

};

W.toString = function() {
  return "Worker " + this.uuid;
};

function defaultCallback(err) {
  if (err) throw err;
}
