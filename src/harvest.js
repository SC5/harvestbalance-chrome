/* global $, moment, console, localforage, Mustache */

// TODO: rewrite with React

(function() {
  "use strict";

  var config = {
    user: getUserId(),
    templates: {
      main: {selector: ".main-panel", index: 0},
      settings: {selector: ".settings-panel", index: 1}
    }
  };

  // lists of public holidays, used list can be switched in settings panel
  var HOLIDAYS = {
    "Finland (public holidays)": {
      // In the order listed: New Year's Day, Epiphany, Good Friday,
      // Easter Monday, Labor Day, Ascension Day, Midsummer's Eve(*),
      // Independence Day, Christmas Eve(*), Christmas Day, Boxing Day
      // (*) paid holiday per collective agreement of Association of IT Sector in Finland
      2013: ["1.1", "6.1", "29.3", "1.4", "1.5", "9.5", "21.6", "6.12", "24.12", "25.12", "26.12"],
      2014: ["1.1", "6.1", "18.4", "21.4", "1.5", "29.5", "20.6", "6.12", "24.12", "25.12", "26.12"],
      2015: ["1.1", "6.1", "3.4", "6.4", "1.5", "14.5", "19.6", "6.12", "24.12", "25.12", "26.12"],
      2016: ["1.1", "6.1", "25.3", "28.3", "1.5", "5.5", "24.6", "6.12", "24.12", "25.12", "26.12"],
      2017: ["1.1", "6.1", "14.4", "17.4", "1.5", "25.5", "23.6", "6.12", "24.12", "25.12", "26.12"]
    },
    "No public holidays": {
      2013: [],
      2014: [],
      2015: [],
      2016: [],
      2017: []
    }
  };

  // loads settings from localForage and returns an object
  function settings() {
    return new Promise(function(resolve, reject) {
      Promise.all([
        localforage.getItem("harvestBalance.startDate"),
        localforage.getItem("harvestBalance.dayLength"),
        localforage.getItem("harvestBalance.holidaysList"),
        localforage.getItem("harvestBalance.initialBalance"),
        localforage.getItem("harvestBalance.paidOvertime")
      ]).then(function(settings) {
        return resolve({
          startDate: settings[0],
          dayLength: settings[1],
          holidaysList: settings[2],
          initialBalance: settings[3],
          paidOvertime: settings[4]
        });
      });
    });
  }

  function buildHolidayLists(selectedList) {
    return Object.keys(HOLIDAYS).map(function(list) {
      return {
        key: list,
        value: list,
        selected: selectedList === list ? "selected" : ""
      };
    });
  }

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

  // retrieves harvest user id from API
  function getUserId() {
    return $.getJSON("/account/who_am_i").then(function(data) {
      return data.user.id;
    });
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
    return weekly.day_entries.reduce(function(obj, entry) {
      obj[entry.day_entry.spent_at] = obj[entry.day_entry.spent_at] || 0;
      obj[entry.day_entry.spent_at] += entry.day_entry.hours;
      return obj;
    }, {});
  }

  function fetchJSON(startDate) {
    return config.user.then(function(userId) {
      return $.getJSON("/time/weekly/"+ startDate.format("YYYY/MM/DD") +"/user/"+userId)
      .then(function(weekly) {
        return reduceWeekly(weekly);
      });
    });
  }

  function getWeeklyHours(monday) {
    return new Promise(function(resolve, reject) {
      var id = "harvestBalance.hours."+ monday.format("YYYY.W");

      // always refetch current week and previous week
      if (shouldRefetch(monday)) {
        fetchJSON(monday).then(function(weeklyHours) {
          localforage.setItem(id, weeklyHours).then(function() {
            resolve(weeklyHours);
          });
        });
      } else {
        // first try from localforage and if it fails, fetch json from harvest
        localforage.getItem(id).then(function(weeklyHours) {
          if (weeklyHours) {
            resolve(weeklyHours);
          } else {
            fetchJSON(monday).then(function(weeklyHours) {
              localforage.setItem(id, weeklyHours).then(function() {
                resolve(weeklyHours);
              });
            });
          }
        });
      }
    });
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

  function todaysHours() {
    return new Promise(function(resolve, reject) {
      localforage
      .getItem("harvestBalance.hours."+ moment().format("YYYY.W"))
      .then(function(weeklyHours) {
        resolve( weeklyHours[moment().format("YYYY-MM-DD")] || 0 );
      });
    });
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
    var holidays = publicHolidays(options.holidaysList);

    return new Promise(function(resolve, reject) {
      var weeklyDeferreds = getMondaysRange(options.from, options.to).map(function(date) {
        return getWeeklyHours(date).then(function(hours) {
          return formatWeeklyHours(hours, options.from);
        }).then(function(hours) {
          return {
            expectedHours: expectedWeeklyHours({
              monday: date,
              startDate: options.from,
              dayLength: options.dayLength,
              holidays: holidays
            }),
            actualHours: hours
          };
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

          var balance = weeklyBalances.map(function(balance) {
            return balance.actualHours - balance.expectedHours;
          }).reduce(function(sum, difference) {
            return sum + difference;
          }, 0.0);

          // add default hours for today if no hours logged in yet and
          // this is a weekday and not a paid holiday
          if (!todaysHours &&
              moment().isoWeekday() < 6 && // mon-fri = 1..5
              !isHoliday(moment(), holidays)) {
            balance = balance + options.dayLength;
          }

          // add initial balance
          balance = balance + options.initialBalance;

          // deduce paid overtime
          balance = balance - paidOvertime;

          resolve(balance);
        });
      });

    });
  }

  function render(balance, options) {
    Promise.all(options.templates).then(function(templates) {
      var template = templates[config.templates[options.template].index];
      var selector = config.templates[options.template].selector;

      $(".balance " + selector).html(
        Mustache.render(template, {
          balance: balance,
          firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
          maxDate: moment().format("YYYY-MM-DD"),
          calendarStart: options.startDate.format("YYYY-MM-DD"),
          startDate: options.startDate.format("DD.MM.YYYY"),
          dayLength: options.dayLength,
          holidayLists: buildHolidayLists(options.holidaysList),
          initialBalance: options.initialBalance,
          paidOvertime: options.paidOvertime
        })
      );
    });
  }

  function format(balance) {
    var sign = balance >= 0 ? "+" : "";
    return sign+parseFloat(balance).toFixed(2);
  }

  function reload(options) {
    clearBalanceHours().then(function() {
      // this awkward setTimeout is needed because localForage has issues with Chrome
      // see: https://github.com/mozilla/localForage/issues/175
      setTimeout(function() {
        balance({
          from: options.startDate,
          to: moment(),
          dayLength: options.dayLength,
          holidaysList: options.holidaysList,
          initialBalance: options.initialBalance,
          paidOvertime: options.paidOvertime
        }).then(function(balance) {
          render(
            format(balance),
            {
              templates: options.templates,
              template: "main",
              startDate: options.startDate,
              dayLength: options.dayLength,
              holidaysList: options.holidaysList,
              initialBalance: options.initialBalance,
              paidOvertime: options.paidOvertime
            }
          );
        });
      }, 0);
    });
  }

  $(function() {

    settings().then(function(settings) {

      var state = {
        startDate: settings.startDate ? moment(settings.startDate) : moment().startOf("year"),
        dayLength: settings.dayLength ? settings.dayLength : 7.5,
        holidaysList: settings.holidaysList ? settings.holidaysList : Object.keys(HOLIDAYS)[0],
        initialBalance: settings.initialBalance ? parseInt(settings.initialBalance, 10) : 0,
        paidOvertime: {
          index: function() {
            return state.paidOvertime.entries.indexOf(this);
          },
          title: function() {
            return moment(this.month, "YYYY-MM").format("MMMM YYYY");
          },
          entries: (
            settings.paidOvertime
              ? settings.paidOvertime
              : []
          ).sort(function(a,b) {
            return a.month > b.month;
          }),
        },
        templates: [
          $.get(chrome.extension.getURL("main-panel.html")),
          $.get(chrome.extension.getURL("settings-panel.html"))
        ]
      };

      var setState = function(key, value) {
        state[key] = value;
      };

      var fetchAndRender = function(template) {
        return balance(
          $.extend({}, state, {from: state.startDate, to: moment()})
        )
        .then(function(balance) {
          render(
            format(balance),
            $.extend({}, state, {template: template || "main"})
          );
        });
      };

      // initial render
      Promise.all(state.templates).then(function(templates) {
        var mainTemplate = templates[0];
        var settingsTemplate = templates[1];

        $("main .wrapper")
        .prepend(
          $("<div class='balance'/>")
        )
        .find('.balance')
        .prepend(
          $("<div class='main-panel'/>").html(
            Mustache.render(mainTemplate,
              {
                balance: "?",
                startDate: state.startDate.format("DD.MM.YYYY")
              }
            )
          )
        )
        .prepend(
          $("<div class='settings-panel'/>").css({display: "none"}).html(
            Mustache.render(settingsTemplate,
              $.extend(
                {},
                state,
                {
                  firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
                  maxDate: moment().format("YYYY-MM-DD"),
                  calendarStart: state.startDate.format("YYYY-MM-DD"),
                }
              )
            )
          )
        );

        $(".balance").on("click", ".reload", function() {
          reload($.extend({}, state));
        });

        $(".balance").on("click", ".settings", function() {
          $(".balance .main-panel").hide();
          $(".balance .settings-panel").show();
        });

        $(".balance").on("click", ".close-settings", function() {
          $(".balance .main-panel").show();
          $(".balance .settings-panel").hide();
          fetchAndRender("main");
        });

        $(".balance").on("input", ".day-length-range", function(event) {
          $(".balance .day-length").val(event.target.value+" hours");
        });

        $(".balance").on("change", ".day-length-range", function(event) {
          setState("dayLength", parseFloat(event.target.value));
          localforage.setItem("harvestBalance.dayLength", state.dayLength);
        });

        $(".balance").on("change", ".holiday-lists", function(event) {
          setState("holidaysList", event.target.value);
          localforage.setItem("harvestBalance.holidaysList", state.holidaysList);
        });

        $(".balance").on("change", ".start-date", function(event) {
          setState("startDate", moment(event.target.value));
          localforage.setItem("harvestBalance.startDate", event.target.value);
        });

        $(".balance").on("change", ".initial-balance", function(event) {
          setState("initialBalance", parseInt(event.target.value, 10));
          localforage.setItem("harvestBalance.initialBalance", state.initialBalance);
        });

        $(".balance").on("click", ".remove", function(event) {
          var index = $(event.target).attr("data-index");
          state.paidOvertime.entries.splice(index, 1);
          localforage.setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
          fetchAndRender("settings");
        });

        $(".balance").on("input", ".paid-overtime-hours", function(event) {
          var $target = $(event.target);
          if ($.isNumeric($target.val())) {
            $target.removeClass("invalid");
            state.paidOvertime.entries[$target.attr("data-index")].hours = $target.val();
            localforage.setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
          } else {
            $target.addClass("invalid");
          }
        });

        $(".balance").on("change click", ".new-paid-overtime-month", function(event) {
          var disabled = !event.target.value || !$.isNumeric($(".balance .new-paid-overtime-value").val());
          $(".balance .buttons-container .add-paid-overtime").prop("disabled", disabled);
        });

        $(".balance").on("input", ".new-paid-overtime-value", function(event) {
          var disabled = !$.isNumeric(event.target.value) || !$(".balance .new-paid-overtime-month").val();
          $(".balance .buttons-container .add-paid-overtime").prop("disabled", disabled);
        });

        $(".balance").on("click", ".add-paid-overtime", function(event) {
          state.paidOvertime.entries.push({
            month: $(".balance .new-paid-overtime-month").val(),
            hours: $(".balance .new-paid-overtime-value").val()
          });
          localforage.setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
          fetchAndRender("settings");
          $(".balance .new-paid-overtime-month").val("");
          $(".balance .new-paid-overtime-value").val("");
          $(".balance .add-paid-overtime").prop("disabled", true);
        });

        // refetch data when #status_message element gets modified
        $("#status_message").on("DOMSubtreeModified", function(a) {
          fetchAndRender("main");
        });

      });

      fetchAndRender("settings");
      fetchAndRender("main");

    });

  });

})();
