var domain = require('domain');
var express = require('express');

exports.handle404 = handle404;
exports.handle500 = handle500;
exports.requestErrorLogger = requestErrorLogger;


function handle404(req, res, next) {
  res.send(404);
}

function handle500(err, req, res, next) {
  var contentType = res.getHeader('content-type') || '';

  if (req.xhr || contentType.indexOf('application/json') === 0) {
    // JSON
    res.send(500, { error: err.stack || err.toString() });
  } else {
    // Stack trace
    res.type('text/plain');
    res.send(500, err.stack || err.toString());
  }
}


/**
 * Log detailed information about request errors.
 */
function requestErrorLogger(logger) {
  var REQ_WHITELIST = ['url', 'headers', 'method', 'httpVersion', 'originalUrl', 'query'];

  return function(err, req, res, next) {
    var exMeta = {};
    if (err.stack)
      exMeta.stack = err.stack;
    else
      exMeta.error = '"' + err.toString() + '"';

    exMeta.req = {};
    REQ_WHITELIST.forEach(function(propName) {
      var value = req[propName];
      if (typeof (value) !== 'undefined')
        exMeta.req[propName] = value;
    });

    logger.logException('middlewareError', exMeta, noOp);

    next(err);
  };
}

function noOp() { }
