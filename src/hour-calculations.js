const $ = require('jquery');
const moment = require('moment');

const HOLIDAYS = require('./holidays');

function buildHolidayLists(selectedList) {
  return Object.keys(HOLIDAYS).map(function(list) {
    return {
      key: list,
      value: list,
      selected: selectedList === list ? "selected" : ""
    };
  });
};

function publicHolidays(list) {
  var holidays = [];

  if (!HOLIDAYS[list]) {
    return [];
  }

  Object.keys(HOLIDAYS[list]).map(function(year) {
    HOLIDAYS[list][year].forEach(function(date) {
      holidays.push( moment(date+"."+year.toString(), "DD.MM.YYYY") );
    });
  });
  return holidays;
}

function isHoliday(date, holidays) {
  return holidays.some(function(holiday) {
    return holiday.isSame(date);
  });
}

function isCurrentWeek(date) {
  return startOfIsoWeek(date).isSame(startOfIsoWeek(moment()));
}

// current & previous week
function shouldRefetch(date) {
  return moment().diff(moment(date), "days") < 14;
}

function startOfIsoWeek(date) {
  return moment(date).startOf("isoWeek");
}

function getMondaysRange(startDate, endDate) {
  var diffWeeks = startOfIsoWeek(endDate).diff(startOfIsoWeek(startDate), "weeks");
  var mondays = [];
  for (var i=0; i <= diffWeeks; i++) {
    mondays.push( startOfIsoWeek(startDate).add(i*7, "days") );
  }
  return mondays;
}

// returns weekly hours as object where keys are the dates as YYYY-MM-DD and values are the sum of daily hours
function reduceWeekly(weekly) {
  return weekly.reduce(function(obj, entry) {
    obj[entry.day_entry.spent_at] = obj[entry.day_entry.spent_at] || 0;
    obj[entry.day_entry.spent_at] += entry.day_entry.hours;
    return obj;
  }, {});
}

function sumKiky(obj) {
  return Object.keys(obj).reduce(function(sum, key){
    // Only sum kiky hours for ongoing year
    return moment(key).year() === moment().year()
      ? sum + parseFloat(obj[key])
      : sum;
  }, 0);
}

function formatWeeklyHours(hoursObj, startDate) {
  var dates = Object.keys(hoursObj);
  var firstDay = moment(dates[0]);

  // for the first week, only count hours from starting day
  if (firstDay.diff(startDate, "weeks") === 0) {
    dates = dates.filter(function(date) {
      return moment(date) >= moment(startDate);
    });
  // for the current week, only count hours for current day and days before it
  } else if (isCurrentWeek(firstDay)) {
    dates = dates.filter(function(date) {
      return moment(date) < moment();
    });
  }

  var hours = dates.reduce(function(sum, date) {
    sum = sum + hoursObj[date];
    return sum;
  }, 0);

  return hours;
}

function expectedWeeklyHours(options) {
  var monday = options.monday;
  var startDate = moment(options.startDate);
  var iterateUntil, week;

  if ( startOfIsoWeek(monday).isSame(startOfIsoWeek(startDate)) ) {
    if (isCurrentWeek(monday)) {
      iterateUntil = moment().isoWeekday() - startDate.isoWeekday();
    } else {
      iterateUntil = 5 - startDate.isoWeekday();
    }
    week = (iterateUntil < 0) ? [] : [moment(startDate)];

    for (var i=1; i <= iterateUntil; i++) {
      week.push( moment(startDate).add(i, "days") );
    }
  } else {
    iterateUntil = isCurrentWeek(monday) ? (moment().isoWeekday() - 1) : 4;
    week = [moment(monday)];

    for (var i=1; i <= iterateUntil; i++) {
      week.push( moment(monday).add(i, "days") );
    }
  }

  return week.filter(function(day) {
    return !isHoliday(day, options.holidays);
  }).reduce(function(sum) {
    return sum + options.dayLength;
  }, 0.0);
}

function balance(options) {
  const holidays = publicHolidays(options.holidaysList);
  const weeklyHours = options.weeklyHours;
  const todaysHours = options.todaysHours;

  return new Promise(function(resolve, reject) {
    var weeklyDeferreds = getMondaysRange(options.from, options.to).map(function(date) {
      return weeklyHours(date, options).then(function(weekly) {
        return {
          actualHours: formatWeeklyHours(weekly.hours, options.from),
          kikyHours: sumKiky(weekly.kikyHours)
        };
      }).then(function(balance) {
        return $.extend({
          expectedHours: expectedWeeklyHours({
            monday: date,
            startDate: options.from,
            dayLength: options.dayLength,
            holidays: holidays
          })
        }, balance);
      });
    });

    // reduce paid overtime for given time period
    var paidOvertime = options.paidOvertime.entries.reduce(function(total, row) {
      var date = moment(row.month, "YYYY-MM").startOf("month");
      if (date >= options.from && date <= options.to) {
        total = total + Number(row.hours);
      }
      return total;
    }, 0);

    Promise.all(weeklyDeferreds).then(function(weeklyBalances) {

      todaysHours().then(function(todaysHours) {

        // Set normal hours balance
        var balance = weeklyBalances.map(function(balance) {
          return balance.actualHours - balance.expectedHours;
        }).reduce(function(sum, difference) {
          return sum + difference;
        }, 0.0);

        // Set KiKy hours balance
        var kikyBalance = weeklyBalances.map(function(balance) {
          return balance.kikyHours;
        }).reduce(function(sum, difference) {
          return sum + difference;
        }, 0.0);

        // add default hours for today if no hours logged in yet and
        // this is a weekday and not a paid holiday
        if (
          !todaysHours &&
          moment().isoWeekday() < 6 && // mon-fri = 1..5
          !isHoliday(moment(), holidays)
        ) {
          balance = balance + options.dayLength;
        }

        // add initial balance
        balance = balance + options.initialBalance;

        // deduce paid overtime
        balance = balance - paidOvertime;
        resolve({
          balance: balance,
          kikyBalance: kikyBalance
        });
      });
    });

  });
}

module.exports = {
  buildHolidayLists,
  publicHolidays,
  isHoliday,
  isCurrentWeek,
  shouldRefetch,
  startOfIsoWeek,
  getMondaysRange,
  reduceWeekly,
  formatWeeklyHours,
  expectedWeeklyHours,
  balance
};
