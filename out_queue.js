var Writable  = require('stream').Writable;
var inherits  = require('util').inherits;
var reconnect = require('reconnect');
var rpc       = require('rpc-stream');
var Jobs      = require('level-jobs');
var uuid      = require('node-uuid').v4;
var log       = console.log;

var db        = require('./db').sublevel('out');
var queue     = Jobs(db, writeToDispatcher, 1);

/// connect to dispatcher

var dispatcherPort = 9181;
var r = reconnect({initialDelay: 1000, maxDelay: 5000}, handleDispatcherConnection)
r.connect(dispatcherPort);

var conn;
var dispatcher;

function handleDispatcherConnection(_conn) {
  conn = _conn;
  conn.setKeepAlive(true);
  conn.setNoDelay(true);
  conn.on('error', onError);
  var client = rpc();
  client.on('error', onError);

  client.pipe(conn).pipe(client);
  dispatcher = client.wrap(['result']);

  conn.once('end', onDispatcherConnectionEnd);

  function onError(err) {
    if (err.code != 'ECONNRESET' && err.code != 'EPIPE') {
      console.error('Error in dispatcher RPC Stream: %s', err.message);
      console.error(err.stack);
      _conn.destroy();
    }
    dispatcher = null;
  }
}

function onDispatcherConnectionEnd() {
  conn = null;
  dispatcher = null;
}

function writeToDispatcher(doc, cb) {
  var canceled = false;

  var timeout = setTimeout(function() {
    canceled = true;
    dispatching = false;
    cb(new Error('timeout'));
  }, 5000);


  if (dispatcher) {
    dispatcher.result(doc, function(err) {
      if (! canceled) {
        clearTimeout(timeout);
        if (err) {
          console.error('Error flushing to dispatcher: %s', err.message);
          console.error(err.stack);
        }
        cb(err);
      }
    });
  } else console.log('no dispatcher to write to');
}

/// Out

exports.out  = Out;

function Out(owner, repo, commit, runId) {
  return queue;

  function queue(name) {
    return new OutQueue(owner, repo, commit, runId, name);
  }
}


///// OutQueue

function OutQueue(owner, repo, commit, runId, name) {

  Writable.call(this, {objectMode: true});

  this.owner  = owner;
  this.repo   = repo;
  this.commit = commit;
  this.runId  = runId;
  this.name   = name;

	this.once('finish', onFinish.bind(this));
}

inherits(OutQueue, Writable);

var OQ = OutQueue.prototype;


/// _write

OQ._write = function _write(d, _, cb) {
  var s = this;

  var doc = {
    id:     uuid(),
    run_id: this.runId,
    when:   Date.now(),
    repo:   this.owner + '/' + this.repo,
    commit: this.commit,
    stream: this.name,
    data:   d
  };
  queue.push(doc, cb);
};


/// onFinish

function onFinish() {
  var doc = {
    id: uuid(),
    run_id: this.runId,
    when:   Date.now(),
    repo: this.owner + '/' + this.repo,
    commit: this.commit,
    stream: 'control',
    data: {
      event: 'end',
      stream: this.name
    }
  };
  queue.push(doc);
}


/// log

OQ.log = function (w) {
  if (! w) w = '';
  w = '[' + this.repo + '#' + this.commit + '][' + this.name + ']: ' + w;
  arguments[0] = w;
  log.apply(null, arguments);
}
