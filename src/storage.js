const localforage = require('localforage');
const moment = require('moment');

const kikyKey = 'harvestBalance.kiky';
const { namespace, kikyNamespace } = require('./config');

// loads settings from localForage and returns an object
function settings() {
  return new Promise(function(resolve, reject) {
    Promise.all([
      localforage.getItem("harvestBalance.startDate"),
      localforage.getItem("harvestBalance.dayLength"),
      localforage.getItem("harvestBalance.holidaysList"),
      localforage.getItem("harvestBalance.initialBalance"),
      localforage.getItem("harvestBalance.paidOvertime"),
      localforage.getItem("harvestBalance.kikyTask"),
      localforage.getItem("harvestBalance.kikyHours")
    ]).then(function(settings) {
      return resolve({
        startDate: settings[0],
        dayLength: settings[1],
        holidaysList: settings[2],
        initialBalance: settings[3],
        paidOvertime: settings[4],
        kikyTask: settings[5],
        kikyHours: settings[6]
      });
    });
  });
}

function balanceKeys() {
  return localforage.keys().then(function(keys) {
    return keys.filter(function(key) {
      return key.match(namespace) || key.match(kikyNamespace);
    });
  });
}

// clears cached weekly hour balances from localforage
function clearBalanceHours() {
  return balanceKeys().then(function(keys) {
    var removePromises = keys.map(function(key) {
      return localforage.removeItem(key);
    });
    return Promise.all(removePromises);
  });
}

function todaysHours() {
  return new Promise(function(resolve, reject) {
    localforage
    .getItem(namespace + moment().format("YYYY.W"))
    .then(function(weeklyHours) {
      resolve( weeklyHours[moment().format("YYYY-MM-DD")] || 0 );
    });
  });
}

function setWeeklyHours(id, weeklyHours) {
  return localforage.setItem(id, weeklyHours);
}

function getWeeklyHours(id) {
  return localforage.getItem(id);
}

function setItem(key, value) {
  return localforage.setItem(key, value);
}

module.exports = {
  settings,
  clearBalanceHours,
  todaysHours,
  setWeeklyHours,
  getWeeklyHours,
  setItem,
};
