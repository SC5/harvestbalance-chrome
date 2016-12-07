const $ = require('jquery');
const { reduceWeekly } = require('./hour-calculations');

// retrieves harvest user id from API
function fetchUserId() {
  return $.getJSON("/account/who_am_i").then(function(data) {
    return data.user.id;
  });
}

function fetchJSON(startDate) {
  return fetchUserId().then(function(userId) {
    return $.getJSON("/time/weekly/"+ startDate.format("YYYY/MM/DD") +"/user/"+userId)
    .then(function(weekly) {
      return reduceWeekly(weekly);
    });
  });
}

module.exports = {
  fetchUserId,
  fetchJSON,
};
