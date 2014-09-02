/* global $, moment, console, localforage */
(function() {
  "use strict";

  // list of public holidays in Finland, hardcoded for now
  var HOLIDAYS = {
    2010: ["1.1", "6.1", "2.4", "5.4", "1.5", "13.5", "25.6", "6.12", "24.12", "25.12", "26.12"],
    2011: ["1.1", "6.1", "22.4", "25.4", "1.5", "2.6", "24.6", "6.12", "24.12", "25.12", "26.12"],
    2012: ["1.1", "6.1", "6.4", "9.4", "1.5", "17.5", "22.6", "6.12", "24.12", "25.12", "26.12"],
    2013: ["1.1", "6.1", "29.3", "1.4", "1.5", "9.5", "21.6", "6.12", "24.12", "25.12", "26.12"],
    2014: ["1.1", "6.1", "18.4", "21.4", "1.5", "29.5", "20.6", "6.12", "24.12", "25.12", "26.12"],
    2015: ["1.1", "6.1", "3.4", "6.4", "1.5", "14.5", "19.6", "6.12", "24.12", "25.12", "26.12"],
    2016: ["1.1", "6.1", "25.3", "28.3", "1.5", "5.5", "24.6", "6.12", "24.12", "25.12", "26.12"],
    2017: ["1.1", "6.1", "14.4", "17.4", "1.5", "25.5", "23.6", "6.12", "24.12", "25.12", "26.12"]
  };

  // day length in hours
  var dayLength = 7.5;

  function publicHolidays() {
    var holidays = [];
    Object.keys(HOLIDAYS).map(function(year) {
      HOLIDAYS[year].forEach(function(date) {
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
    return moment(date).isoWeek() === moment().isoWeek();
  }

  // current & previous week
  function shouldRefetch(date) {
    return ( isCurrentWeek(date) || moment(date).isoWeek() === moment().subtract(1, "weeks").isoWeek() );
  }

  // retrieves harvest user id from preloaded JSON
  function getUserId() {
    return Object.keys(JSON.parse($("#all-users-data-island").html()))[0];
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

  function reduceWeekly(weekly) {
    var currentWeek = isCurrentWeek(moment(weekly.day_entries[0].day_entry.spent_at));
    return weekly.day_entries.reduce(function(sum, entry) {
      if (currentWeek) {
         var entryDate = moment(entry.day_entry.spent_at);
         if (entryDate < moment()) {
            return sum + entry.day_entry.hours;
         } else {
            return sum;
         }
      } else {
        return sum + entry.day_entry.hours;
      }
    }, 0);
  }

  function fetchJSON(startDate) {
    return $.getJSON("/time/weekly/"+ startDate.format("YYYY/MM/DD") +"/user/"+getUserId()).then(function(weekly) {
      return reduceWeekly(weekly);
    });
  }

  function getWeeklyHours(startDate) {
    var deferred = $.Deferred();
    var id = "harvestBalance.hours."+ startDate.format("YYYY.W");

    // always refetch current week and previous week
    if (shouldRefetch(startDate)) {
      fetchJSON(startDate).then(function(weeklyHours) {
        localforage.setItem(id, weeklyHours).then(function() {
          deferred.resolve(weeklyHours);
        });
      });
    } else {
      // first try from localforage and if it fails, fetch json from harvest
      localforage.getItem(id).then(function(weeklyHours) {
        if (weeklyHours) {
          deferred.resolve(weeklyHours);
        } else {
          fetchJSON(startDate).then(function(weeklyHours) {
            localforage.setItem(id, weeklyHours).then(function() {
              deferred.resolve(weeklyHours);
            });
          });
        }
      });
    }

    return deferred.promise();
  }

  function balanceKeys() {
    return localforage.keys().then(function(keys) {
      return keys.filter(function(key) {
        return key.match("harvestBalance.hours.");
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

  // NOTE: startDate is always assumed to be monday
  function expectedWeeklyHours(startDate) {
    var holidays = publicHolidays();
    var iterateUntil = isCurrentWeek(startDate) ? (moment().isoWeekday() - 1) : 4;
    var week = [moment(startDate)];

    for (var i=1; i <= iterateUntil; i++) {
      week.push( moment(startDate).add(i, "days") );
    }

    return week.filter(function(day) {
      return !isHoliday(day, holidays);
    }).reduce(function(sum) {
      return sum + dayLength;
    }, 0.0);
  }

  function balance(from, to) {
    var deferred = $.Deferred();
    var weeklyDeferreds = getMondaysRange(from, to).map(function(date) {
      return getWeeklyHours(date).then(function(hours) {
        return {
          expectedHours: expectedWeeklyHours(date),
          actualHours: hours
        };
      });
    });

    $.when.apply($, weeklyDeferreds).then(function() {
      var weeklyBalances = [].slice.call(arguments, 0);

      var balance = weeklyBalances.map(function(balance) {
        return balance.actualHours - balance.expectedHours;
      }).reduce(function(sum, difference) {
        return sum + difference;
      }, 0.0);

      deferred.resolve(balance);
    });

    return deferred.promise();
  }

  function render(balance, template, options) {
    template.then(function(tmpl) {
      $(".balance").html(_template(tmpl, {
        balance: balance,
        firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
        calendarStart: options.startDate.format("YYYY-MM-DD"),
        startDate: options.startDate.format("DD.MM.YYYY")
      }));
    });
  }

  function format(balance) {
    var sign = balance >= 0 ? "+" : "";
    return sign+balance;
  }

  function _template(str, data){
    for (var property in data) {
      str = str.replace(new RegExp('{'+property+'}','g'), data[property]);
    }
    return str;
  }

  function reload(startDate, template) {
    clearBalanceHours().then(function() {
      // this awkward setTimeout is needed because localForage has issues with Chrome
      // see: https://github.com/mozilla/localForage/issues/175
      setTimeout(function() {
        balance(startDate, moment()).done(function(balance) {
          render(format(balance), template, {startDate: startDate});
        });
      }, 0);
    });
  }

  $(function() {

    localforage.getItem("harvestBalance.startDate").then(function(startDate) {
      startDate = startDate ? moment(startDate) : moment().startOf("year");

      var template = $.get(chrome.extension.getURL("template.html"));

      // initial render
      template.then(function(tmpl) {
        $("#main_content .wrapper").prepend($("<div class='balance'/>").html(_template(tmpl, {
          balance: "?",
          firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
          calendarStart: startDate.format("YYYY-MM-DD"),
          startDate: startDate.format("DD.MM.YYYY")
        })));

        $(".balance").on("click", ".reload", function() {
          reload(startDate, template);
        });

        $(".balance").on("click", ".date-picker", function() {
          var $date_input = $(".balance .date-input");
          $date_input.toggle();
          $date_input.change(function(event) {
            startDate = moment(event.target.value);
            localforage.setItem("harvestBalance.startDate", event.target.value);
            $date_input.hide();
            balance(startDate, moment()).done(function(balance) {
              render(format(balance), template, {startDate: startDate});
            });
          });
        });
      });

      balance(startDate, moment()).done(function(balance) {
        render(format(balance), template, {startDate: startDate});
      });

    });

  });

})();
