var workers = require('./workers');

exports.enroll  = enroll;
exports.expel   = expel;
exports.workers = getWorkers;

function enroll(args, cb) {
  workers.enroll(args[0], cb);
}

function expel(args, cb) {
  workers.expel(args[0], cb);
}

function getWorkers(args, cb) {
  cb(workers.workers);
}