require('colors');
var assert    = require('assert');
var async     = require('async');
var reconnect = require('reconnect');
var rpc       = require('rpc-stream');
var workers   = require('./workers');
var db        = require('./db').sublevel('in');
var Jobs      = require('level-jobs');
var log       = console.log;


var pendingGetWorks = 0;
var pendingWorks    = 0;


/// trigger database

var queue = Jobs(db, doWork);

queue.once('drain', onFirstQueueDrain);
function onFirstQueueDrain() {
  log('we should be done with the backlog triggering now, ' +
      'on to listening for available workers');

  workers.on('available', workerAvailable);

}

function workerAvailable() {
  perhapsWork();
}

function perhapsWork() {
  var available = workers.available() - pendingWorks - pendingGetWorks;
  if (available > 0) {
    log('%d workers are available', available);
    for (var i = 0 ; i < available; i ++) getWork();
  }
}

/// connect to dispatcher

var dispatcherPort = 9181;
log('connecting to %d', dispatcherPort);
var r = reconnect({initialDelay: 1000, maxDelay: 5000}, handleConnection);
r.connect(dispatcherPort);

var conn;
var client;
var dispatcher;

function handleConnection(_conn) {
  conn = _conn;
  conn.setKeepAlive(true);
  conn.setNoDelay(true);
  conn.on('error', onError);
  client = rpc();
  client.on('error', onError);
  client.pipe(conn).pipe(client);
  dispatcher = client.wrap(['next']);

  for (var i = 0; i < pendingGetWorks; i ++) {
    dispatcher.next(onWork);
  }

  function onError(err) {
    if (err.code != 'ECONNRESET') {
      console.error('Error in dispatcher RPC Stream: %s', err.message);
      console.error(err.stack);
      _conn.destroy();
    }
  }
}

/// getWork

function getWork() {
  pendingGetWorks ++;
  if (dispatcher) {
    log('trying to get work from dispatcher');
    dispatcher.next(onWork);
  } else log('no dispatcher to get work from');
}

function onWork(err, work) {
  pendingGetWorks --;
  pendingWorks ++;
  log('got work from dispatcher:', work);
  if (err) {
    console.error('Error getting next from remote:', err.message);
    console.error(err.stack);
  } else queue.push(work, workPushed);

  function workPushed(err) {
    if (err) {
      console.error('Error inserting work in local queue', err.message);
      console.error(err.stack);
    }
  }
}


/// doWork

function doWork(work, done) {

  assert(work.owner,  'no work.owner');
  assert(work.repo,   'no work.repo');
  assert(work.commit, 'no work.commit');

  workers.next(onWorker);

  function onWorker(err, worker) {
    if (err) done(err);
    else {
      log('got worker for', work);
      worker.run(work.owner, work.repo, work.commit, onWorkDone);
    }
  }

  function onWorkDone(err) {
    if (err) {
      if (! err.user) {
        log('worker finished with error %s, going to retry in 60 secs'.red, err.message.trim());
        setTimeout(function() {
          done(err);
        }, 30000);
      } else {
        log('worker finished with user error %s', err.message.trim());
        done();
      }
    } else {
      pendingWorks --;
      done();
    }
  }
}


/// Stop

exports.stop = stop;

function stop() {
  r.reconnect = false;
  if (conn) conn.destroy();
}
