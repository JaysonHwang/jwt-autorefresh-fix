'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = autorefresh;

var _jwtSimple = require('jwt-simple');

var _chai = require('chai');

// import { createLogger } from 'bunyan'

var createLogger = function createLogger() {
  return console;
};
var IS_DEV = process.env.NODE_ENV !== 'production';
var MAX_DELAY = Math.pow(2, 31) - 1; // setTimeout,setInterval max delay 
var DEFAULT_DELAY_FUNC = function DEFAULT_DELAY_FUNC(_ref) {
  var exp = _ref.exp,
      iat = _ref.iat,
      lead = _ref.lead;

  var lifeLong = exp - Date.now();
  return lifeLong - lead;
};
var CODES = {
  DELAY: 'DELAY',
  DELAY_ERROR: 'DELAY_ERROR',
  INVALID_JWT: 'INVALID_JWT',
  INVALID_DELAY_FUNC: 'INVALID_DELAY_FUNC',
  EXECUTE: 'EXECUTE',
  SCHEDULE: 'SCHEDULE',
  START: 'START',
  CANCEL: 'CANCEL'
};
var format = function format(code, message) {
  return code + '|' + message;
};

var validate = function validate(_ref2) {
  var refresh = _ref2.refresh,
      leadSeconds = _ref2.leadSeconds,
      _ref2$delayFunc = _ref2.delayFunc,
      delayFunc = _ref2$delayFunc === undefined ? DEFAULT_DELAY_FUNC : _ref2$delayFunc,
      _ref2$log = _ref2.log,
      log = _ref2$log === undefined ? createLogger({ name: 'autorefresh', level: IS_DEV ? 'warn' : 'error' }) : _ref2$log;

  if (IS_DEV) {
    _chai.assert.ok(refresh, 'autorefresh requires a refresh function parameter');
    _chai.assert.ok(leadSeconds, 'autorefresh requires a leadSeconds number or function returning a number in seconds parameter');
    _chai.assert.typeOf(refresh, 'function', 'autorefresh refresh parameter must be a function');
    _chai.assert.typeOf(delayFunc, 'function', 'autorefresh delayFunc parameter must be a function');
    (0, _chai.assert)(['number', 'function'].includes(typeof leadSeconds === 'undefined' ? 'undefined' : _typeof(leadSeconds)), 'function', 'autorefresh refresh parameter must be a function');
  }
  return { refresh: refresh, leadSeconds: leadSeconds, delayFunc: delayFunc, log: log };
};
function autorefresh(opts) {
  var _validate = validate(opts),
      refresh = _validate.refresh,
      leadSeconds = _validate.leadSeconds,
      log = _validate.log,
      delayFunc = _validate.delayFunc;

  var timeoutID = null;

  var calculateDelay = function calculateDelay(access_token) {
    try {
      if (IS_DEV) {
        _chai.assert.ok(access_token, 'calculateDelay expects an access_token parameter');
        _chai.assert.typeOf(access_token, 'string', 'access_token should be a string');
      }

      var _decode = (0, _jwtSimple.decode)(access_token, null, true),
          exp = _decode.exp,
          nbf = _decode.nbf,
          iat = _decode.iat;

      if (IS_DEV) {
        _chai.assert.ok(exp, 'autorefresh requires JWT token with "exp" standard claim');
        _chai.assert.ok(iat, 'autorefresh requires JWT token with "iat" standard claim');
        if (nbf) {
          _chai.assert.typeOf(nbf, 'number', 'nbf claim should be a future NumericDate value');
          _chai.assert.isBelow(nbf, exp, '"nbf" claim should be less than "exp" claim if it exists');
        }
        if (iat) {
          _chai.assert.typeOf(iat, 'number', 'iat claim should be a history NumericDate value');
          _chai.assert.isBelow(iat, exp, '"iat" claim should be less than "exp" claim if it exists');
        }
      }
      var lead = typeof leadSeconds === 'function' ? leadSeconds() : leadSeconds;
      if (IS_DEV) {
        _chai.assert.typeOf(lead, 'number', 'leadSeconds must be or return a number');
        _chai.assert.isAbove(lead, 0, 'lead seconds must resolve to a positive number of seconds');
      }
      var expectDelay = delayFunc({ exp: exp, iat: iat, lead: lead }) * 1000;
      var realDelay = expectDelay;
      if (expectDelay > MAX_DELAY) {
        realDelay = MAX_DELAY;
        log.info(format(CODES.DELAY, 'expected ' + expectDelay + '(ms) downgrade to ' + realDelay + '(ms), caused by setTimeout|setInterval limit of ' + MAX_DELAY + '(ms)'));
      }
      log.info(format(CODES.DELAY, 'calculated autorefresh delay => ' + (realDelay / 1000).toFixed(1) + ' seconds'));
      return realDelay;
    } catch (err) {
      if (/$Unexpected token [A-Za-z] in JSON/.test(err.message)) throw new Error(format(CODES.INVALID_JWT, 'JWT token was not a valid format => ' + access_token));
      throw new Error(format(CODES.DELAY_ERROR, 'error occurred calculating autorefresh delay => ' + err.message));
    }
  };

  var _schedule = function _schedule(access_token) {
    if (IS_DEV) _chai.assert.typeOf(access_token, 'string', '_schedule expects a string access_token parameter');
    var delay = calculateDelay(access_token);
    if (IS_DEV) _chai.assert.isAbove(delay, 0, 'next auto refresh should always be in the future');
    return schedule(delay);
  };

  var execute = function execute() {
    clearTimeout(timeoutID);
    log.info(format(CODES.EXECUTE, 'executing refresh'));
    var result = refresh();
    if (typeof result === 'string') return _schedule(result);
    _chai.assert.ok(result.then, 'refresh must return the access_token or a string that resolves to the access_token');
    return result.then(function (access_token) {
      return _schedule(access_token);
    }).catch(function (err) {
      log.error(err, format(CODES.INVALID_REFRESH, 'refresh rejected with an error => ' + err.message));
      throw err;
    });
  };

  var schedule = function schedule(delay) {
    clearTimeout(timeoutID);
    log.info(format(CODES.SCHEDULE, 'scheduled refresh in ' + (delay / 1000).toFixed(1) + ' seconds'));
    timeoutID = setTimeout(function () {
      return execute();
    }, delay);
  };

  var start = function start(access_token) {
    log.info(format(CODES.START, 'autorefresh started'));
    var delay = calculateDelay(access_token);
    if (IS_DEV) _chai.assert.typeOf(delay, 'number', 'calculateDelay must return a number in milliseconds');
    if (delay > 0) schedule(delay);else execute();
    var stop = function stop() {
      clearTimeout(timeoutID);
      log.info(format(CODES.CANCEL, 'autorefresh cancelled'));
    };
    return stop;
  };
  return start;
}