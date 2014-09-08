/* global $, moment, console, localforage */
(function() {
  "use strict";

  // lists of public holidays, used list can be switched in settings panel
  var HOLIDAYS = {
    "Finland (public holidays)": {
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

  function settings() {
    return new Promise(function(resolve, reject) {
      Promise.all([
        localforage.getItem("harvestBalance.startDate"),
        localforage.getItem("harvestBalance.dayLength"),
        localforage.getItem("harvestBalance.holidaysList")
      ]).then(function(settings) {
        resolve({
          startDate: settings[0],
          dayLength: settings[1],
          holidaysList: settings[2]
        });
      });
    });
  }

  function buildHolidayLists(selectedList) {
    var $select = $("<select class='holiday-lists'>");
    Object.keys(HOLIDAYS).forEach(function(list) {
      var $option = $("<option>").val(list).html(list);
      if (selectedList === list) $option.attr("selected", true);
      $select.append( $option );
    });
    return $select[0].outerHTML;
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

  // returns weekly hours as object where keys are the dates as YYYY-MM-DD and values are the sum of daily hours
  function reduceWeekly(weekly) {
    return weekly.day_entries.reduce(function(obj, entry) {
      obj[entry.day_entry.spent_at] = obj[entry.day_entry.spent_at] || 0;
      obj[entry.day_entry.spent_at] += entry.day_entry.hours;
      return obj;
    }, {});
  }

  function fetchJSON(startDate) {
    return $.getJSON("/time/weekly/"+ startDate.format("YYYY/MM/DD") +"/user/"+getUserId()).then(function(weekly) {
      return reduceWeekly(weekly);
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
    if (firstDay.isoWeek() === moment(startDate).isoWeek()) {
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
      localforage.getItem("harvestBalance.hours."+ moment().format("YYYY.W")).then(function(weeklyHours) {
        resolve( weeklyHours[moment().format("YYYY-MM-DD")] || 0 );
      });
    });
  }

  function expectedWeeklyHours(options) {
    var monday = options.monday;
    var startDate = moment(options.startDate);
    var holidays = publicHolidays(options.holidaysList);
    var iterateUntil, week;

    if (moment(monday).isoWeek() === startDate.isoWeek()) {
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
      return !isHoliday(day, holidays);
    }).reduce(function(sum) {
      return sum + options.dayLength;
    }, 0.0);
  }

  function balance(options) {
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
              holidaysList: options.holidaysList
            }),
            actualHours: hours
          };
        });
      });

      Promise.all(weeklyDeferreds).then(function(weeklyBalances) {

        todaysHours().then(function(todaysHours) {

          var balance = weeklyBalances.map(function(balance) {
            return balance.actualHours - balance.expectedHours;
          }).reduce(function(sum, difference) {
            return sum + difference;
          }, 0.0);

          // add default hours for today if no hours logged in yet
          if (!todaysHours) {
            balance = balance + options.dayLength;
          }

          resolve(balance);
        });
      });

    });
  }

  function render(balance, options) {
    options.template.then(function(template) {
      $(".balance").html(_template(template, {
        balance: balance,
        firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
        calendarStart: options.startDate.format("YYYY-MM-DD"),
        startDate: options.startDate.format("DD.MM.YYYY"),
        dayLength: options.dayLength,
        holidayLists: buildHolidayLists(options.holidaysList)
      }));
    });
  }

  function format(balance) {
    var sign = balance >= 0 ? "+" : "";
    return sign+parseFloat(balance).toFixed(2);
  }

  function _template(str, data){
    for (var property in data) {
      str = str.replace(new RegExp('{'+property+'}','g'), data[property]);
    }
    return str;
  }

  function reload(options) {
    clearBalanceHours().then(function() {
      // this awkward setTimeout is needed because localForage has issues with Chrome
      // see: https://github.com/mozilla/localForage/issues/175
      setTimeout(function() {
        balance({from: options.startDate, to: moment(), dayLength: options.dayLength, holidaysList: options.holidaysList}).then(function(balance) {
          render(format(balance), {template: options.template, startDate: options.startDate, dayLength: options.dayLength, holidaysList: options.holidaysList});
        });
      }, 0);
    });
  }

  $(function() {

    settings().then(function(settings) {
      var startDate = settings.startDate ? moment(settings.startDate) : moment().startOf("year");
      var dayLength = settings.dayLength ? settings.dayLength : 7.5;
      var holidaysList = settings.holidaysList ? settings.holidaysList : Object.keys(HOLIDAYS)[0];

      var template = $.get(chrome.extension.getURL("template.html"));

      var fetchAndRender = function() {
        return balance({from: startDate, to: moment(), dayLength: dayLength, holidaysList: holidaysList}).then(function(balance) {
          render(format(balance), {template: template, startDate: startDate, dayLength: dayLength, holidaysList: holidaysList});
        });
      }

      // initial render
      template.then(function(tmpl) {
        $("#main_content .wrapper").prepend($("<div class='balance'/>").html(_template(tmpl, {
          balance: "?",
          firstDayOfPreviousYear: moment().subtract(1, "years").startOf('year').format("YYYY-MM-DD"),
          calendarStart: startDate.format("YYYY-MM-DD"),
          startDate: startDate.format("DD.MM.YYYY"),
          dayLength: dayLength
        })));

        $(".balance").on("click", ".reload", function() {
          reload({startDate: startDate, template: template, dayLength: dayLength, holidaysList: holidaysList});
        });

        $(".balance").on("click", ".settings", function() {
          $(".balance .main-panel").hide();
          $(".balance .settings-panel").show();
        });

        $(".balance").on("click", ".close-settings", function() {
          $(".balance .main-panel").show();
          $(".balance .settings-panel").hide();
        });

        $(".balance").on("input", ".day-length-range", function(event) {
          $(".balance .day-length").val(event.target.value+" hours");
        });

        $(".balance").on("change", ".day-length-range", function(event) {
          dayLength = parseFloat(event.target.value);
          localforage.setItem("harvestBalance.dayLength", dayLength);
          fetchAndRender();
        });

        $(".balance").on("change", ".holiday-lists", function(event) {
          holidaysList = event.target.value;
          localforage.setItem("harvestBalance.holidaysList", holidaysList);
          fetchAndRender();
        });

        $(".balance").on("click", ".date-picker", function() {
          var $date_input = $(".balance .date-input");
          $date_input.toggle();
          $date_input.change(function(event) {
            startDate = moment(event.target.value);
            localforage.setItem("harvestBalance.startDate", event.target.value);
            $date_input.hide();
            fetchAndRender();
          });
        });

        // refetch data when #AjaxSuccess element gets modified
        $("#AjaxSuccess").on("DOMSubtreeModified", function(a) {
          fetchAndRender();
        });

      });

      fetchAndRender();

    });

  });

})();
