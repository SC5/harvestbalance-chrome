const expect = require('expect');
const moment = require('moment');
const tk = require('timekeeper');

const HOLIDAYS = require('../src/holidays');
const {
  buildHolidayLists,
  expectedWeeklyHours,
  publicHolidays,
  balance,
} = require('../src/hour-calculations');

describe('Harvest balance', () => {
  describe('Holidays', () => {
    it('should have holiday lists available', () => {
      expect(HOLIDAYS).toIncludeKeys(['Finland (public holidays)', 'No public holidays']);
    });
    it('should have holiday lists defined for years 2010-2017', () => {
      expect(HOLIDAYS['Finland (public holidays)']).toIncludeKeys([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017]);
      expect(HOLIDAYS['No public holidays']).toIncludeKeys([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017]);
    });
  });

  describe('Expected weekly hours', () => {
    it('should ', () => {

    });

    it('should require 38 billable hours on normal week', () => {
      tk.freeze(moment("2016-12-16").endOf("day").toDate());
      const hours = expectedWeeklyHours({
        monday: moment("2016-12-12"),
        startDate: moment("2016-12-12"),
        dayLength: 7.5,
        mondayLength: 8.0,
        holidays: publicHolidays(Object.keys(HOLIDAYS)[0])
      });
      expect(hours).toEqual(38);
      tk.reset();
    });

    it('should not require any billable hours on public holidays', () => {
      tk.freeze(moment("2016-12-09").endOf("day").toDate());
      const hours = expectedWeeklyHours({
        monday: moment("2016-12-05"),
        startDate: moment("2016-12-05"),
        dayLength: 7.5,
        mondayLength: 8,
        holidays: publicHolidays(Object.keys(HOLIDAYS)[0])
      });
      expect(hours).toEqual(30.5);
      tk.reset();
    });
  });

  describe('Balance', () => {

    it('should not require any billable hours on public holidays', (done) => {
      tk.freeze(moment("2016-12-09").endOf("day").toDate());

      // mock weeklyHours
      const weeklyHours = () => {
        return Promise.resolve({
          "2016-12-05": 7.5,
          "2016-12-07": 7.5,
          "2016-12-08": 7.5,
          "2016-12-09": 7.5,
        });
      }

      balance({
        from: moment("2016-12-05"),
        to: moment("2016-12-09"),
        dayLength: 7.5,
        holidaysList: Object.keys(HOLIDAYS)[0],
        initialBalance: 0,
        paidOvertime: {entries: []},
        weeklyHours: weeklyHours,
        todaysHours: Promise.resolve(7.5)
      }).then((balance) => {
        expect(balance).toEqual(0);
        tk.reset();
        done();
      });
    });

    it('should add any billable hours on public holidays to balance', (done) => {
      tk.freeze(moment("2016-12-09").endOf("day").toDate());

      // mock weeklyHours
      const weeklyHours = () => {
        return Promise.resolve({
          "2016-12-05": 7.5,
          "2016-12-06": 5,
          "2016-12-07": 7.5,
          "2016-12-08": 7.5,
          "2016-12-09": 7.5,
        });
      }

      balance({
        from: moment("2016-12-05"),
        to: moment("2016-12-09"),
        dayLength: 7.5,
        holidaysList: Object.keys(HOLIDAYS)[0],
        initialBalance: 0,
        paidOvertime: {entries: []},
        weeklyHours: weeklyHours,
        todaysHours: Promise.resolve(7.5)
      }).then((balance) => {
        expect(balance).toEqual(5);
        tk.reset();
        done();
      });
    });

  });
});
