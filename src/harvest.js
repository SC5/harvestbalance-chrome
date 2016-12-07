const $ = require('jquery');
const moment = require('moment');
const Mustache = require('mustache');

const HOLIDAYS = require('./holidays');

const { namespace } = require('./config');

const {
  fetchUserId,
  fetchJSON,
} = require('./fetch');

const {
  buildHolidayLists,
  shouldRefetch,
  balance,
} = require('./hour-calculations');

const {
  settings,
  balanceKeys,
  clearBalanceHours,
  todaysHours,
  setWeeklyHours,
  getWeeklyHours,
  setItem,
} = require('./storage');

const config = {
  templates: {
    main: {selector: ".main-panel", index: 0},
    settings: {selector: ".settings-panel", index: 1}
  }
};

function weeklyHours(monday) {
  return new Promise(function(resolve, reject) {
    var id;
    if (monday.isoWeek() === 1) {
      id = namespace + moment(monday).endOf("isoWeek").format("YYYY.W");
    } else {
      id = namespace + monday.format("YYYY.W");
    }

    // always refetch current week and previous week
    if (shouldRefetch(monday)) {
      fetchJSON(monday).then(function(weeklyHours) {
        setWeeklyHours(id, weeklyHours).then(function() {
          resolve(weeklyHours);
        });
      });
    } else {
      // first try from storage and if it fails, fetch json from harvest
      getWeeklyHours(id).then(function(weeklyHours) {
        if (weeklyHours) {
          resolve(weeklyHours);
        } else {
          fetchJSON(monday).then(function(weeklyHours) {
            setWeeklyHours(id, weeklyHours).then(function() {
              resolve(weeklyHours);
            });
          });
        }
      });
    }
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
  var sign = balance > 0 ? "+" : "";
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
        paidOvertime: options.paidOvertime,
        weeklyHours: weeklyHours,
        todaysHours: todaysHours()
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
        $.extend({}, state, {
          from: state.startDate,
          to: moment(),
          weeklyHours: weeklyHours,
          todaysHours: todaysHours()
        })
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

      $("main .js-root-view")
      .before(
        $("<div class='balance'/>")
      );
      $("main .wrapper")
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
        setItem("harvestBalance.dayLength", state.dayLength);
      });

      $(".balance").on("change", ".holiday-lists", function(event) {
        setState("holidaysList", event.target.value);
        setItem("harvestBalance.holidaysList", state.holidaysList);
      });

      $(".balance").on("change", ".start-date", function(event) {
        setState("startDate", moment(event.target.value));
        setItem("harvestBalance.startDate", event.target.value);
      });

      $(".balance").on("change", ".initial-balance", function(event) {
        setState("initialBalance", parseInt(event.target.value, 10));
        setItem("harvestBalance.initialBalance", state.initialBalance);
      });

      $(".balance").on("click", ".remove", function(event) {
        var index = $(event.target).attr("data-index");
        state.paidOvertime.entries.splice(index, 1);
        setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
        fetchAndRender("settings");
      });

      $(".balance").on("input", ".paid-overtime-hours", function(event) {
        var $target = $(event.target);
        if ($.isNumeric($target.val())) {
          $target.removeClass("invalid");
          state.paidOvertime.entries[$target.attr("data-index")].hours = $target.val();
          setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
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
        setItem("harvestBalance.paidOvertime", state.paidOvertime.entries);
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
