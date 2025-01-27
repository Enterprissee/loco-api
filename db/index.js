const connection = require('./config');
const util = require('../lib/util');

// Add new fetchers here
const mtaParser = require('../parsers').mta.staticParser;
// Remember to put the fetcher into this object for retrieval
const PARSERS = {
  mta: mtaParser
};

// Sub must be provided, or else all queries will return null

const _createStopTimesQuery = (sub) => `
  CREATE TABLE ${sub}_stop_times (
    id int NOT NULL AUTO_INCREMENT,
    route_id varchar(10) NOT NULL,
    route_type varchar(10) NOT NULL,
    arrival_time varchar(20) NOT NULL,
    stop_id varchar(10) NOT NULL,
    PRIMARY KEY (id)
  )
`;

const _createStopsQuery = (sub) => `
  CREATE TABLE ${sub}_stops (
    id int NOT NULL AUTO_INCREMENT,
    stop_id varchar(10) NOT NULL,
    stop_name varchar(50) NOT NULL,
    stop_lat varchar(20) NOT NULL,
    stop_lon varchar(20) NOT NULL,
    PRIMARY KEY (id)
  )
`;

const _createRoutesQuery = (sub) => `
  CREATE TABLE ${sub}_routes (
    id int NOT NULL AUTO_INCREMENT,
    route_id varchar(10) NOT NULL,
    route_desc varchar(2000) NOT NULL,
    PRIMARY KEY (id)
  )
`;

const _createStopRoutesQuery = (sub) => `
  CREATE TABLE ${sub}_stop_routes (
    id int NOT NULL AUTO_INCREMENT,
    route_id varchar(10) NOT NULL,
    stop_id varchar(10) NOT NULL,
    PRIMARY KEY(id)
  )
  SELECT DISTINCT route_id, stop_id 
  FROM ${sub}_stop_times
`;

const _dropTablesQuery = (sub) => `
  DROP TABLE IF EXISTS 
    ${sub}_stops, 
    ${sub}_stop_times, 
    ${sub}_routes, 
    ${sub}_stop_routes
`;

const _insertIntoStoptimesQuery = (sub) => `
  INSERT INTO ${sub}_stop_times (route_id, route_type, arrival_time, stop_id) VALUES ?
`;

const _insertIntoStopsQuery = (sub) => `
  INSERT INTO ${sub}_stops (stop_id, stop_name, stop_lat, stop_lon) VALUES ?;
`;

const _insertIntoRoutesQuery = (sub) => `
  INSERT INTO ${sub}_routes (route_id, route_desc) VALUES ?
`;

const _dropTables = (sub) => new Promise((resolve, reject) => {
  connection.query(_dropTablesQuery(sub), (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

// Helper method for creating tables
const _createTable = (query) => new Promise((resolve, reject) => {
  connection.query(query, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

// Defer stop_routes table until after below tables have had data inserted
const _createTables = (sub) => new Promise((resolve, reject) => {
  _createTable(_createStopsQuery(sub))
  .then((result) => _createTable(_createRoutesQuery(sub)))
  .then((result) => _createTable(_createStopTimesQuery(sub)))
  .then((result) => resolve(result))
  .catch((error) => {
    console.log;
    reject(error);
  });
});

const _insertStopTimes = (sub, data) => new Promise((resolve, reject) => {
  let query = (data) => {
    let newData = data.splice(0, 10000);
    connection.query(_insertIntoStoptimesQuery(sub), [newData], (error, result) => {
      if (error) { return reject(error); }
      if (data.length) { return query(data); }
      resolve(result);
    });
  };
  query(data);
});

const _insertStops = (sub, data) => new Promise((resolve, reject) => {
  connection.query(_insertIntoStopsQuery(sub), [data], (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const _insertRoutes = (sub, data) => new Promise((resolve, reject) => {
  connection.query(_insertIntoRoutesQuery(sub), [data], (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const _insertStopRoutes = (sub) => new Promise((resolve, reject) => {
  connection.query(_createStopRoutesQuery(sub), (error, result) => {
    if (error){ return reject(error); }
    resolve(result);
  });
});

// All outward methods below. Requests with invalid subs will receive a null response
const updateSchedule = (sub) => new Promise((resolve, reject) => {
  if (!sub || !sub.length || typeof sub !== 'string') { return null; }
  if (!PARSERS[sub]) { return null; }
  PARSERS[sub].getAll()
  .then((parsedData) => {
    if (!parsedData.stoptimes.length) { throw 'Error parsing stoptimes'; }
    if (!parsedData.stops.length) { throw 'Error parsing stops'; }
    if (!parsedData.routes.length) { throw 'Error parsing routes'; }
    data = parsedData;
    return _dropTables(sub);
  })
  .then((result) => _createTables(sub))
  .then((result) => _insertStopTimes(sub, data.stoptimes))
  .then((result) => _insertStops(sub, data.stops))
  .then((result) => _insertRoutes(sub, data.routes))
  .then((result) => _insertStopRoutes(sub))
  .then((result) => {
    console.log(`Successfully updated ${sub} schedule`);
    resolve(result);
  })
  .catch((error) => {
    console.log(error);
    reject(error);
  });
});

const getTimesByStop = (sub, stopId) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stop_times` WHERE `stop_id` = ?';
  connection.query(query, stopId, (error, result) => {
    if (error) { return reject(error); }
    util.sortByTime(result);
    resolve(result);
  });
});

const getTimesByRoute = (sub, routeId) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stop_times` WHERE `route_id` = ?';
  connection.query(query, routeId, (error, result) => {
    if (error) { return reject(error); }
    util.sortByTime(result);
    resolve(result);
  });
});

const getTimesByStopAndRoute = (sub, stopId, routeId) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stop_times` WHERE `stop_id` = ? AND `route_id` = ?'
  connection.query(query, [stopId, routeId], (error, result) => {
    if (error) { return reject(error); }
    util.sortByTime(result);
    resolve(result);
  });
});

const getStops = (sub) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stops`';
  connection.query(query, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const getStop = (sub, stopId) => new Promise ((resolve, reject) => {
  let query = 'SELECT * from `' +sub+ '_stops` WHERE `stop_id` = ?';
  connection.query(query, stopId, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const getRoutes = (sub) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_routes`';
  connection.query(query, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const getRoute = (sub, routeId) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_routes` WHERE `route_id` = ?';
  connection.query(query, routeId, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

const getStopsByRoute = (sub, routeId) => new Promise ((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stop_routes` sr INNER JOIN `' +sub+ '_stops` s ON sr.stop_id = s.stop_id WHERE route_id = ?'
  connection.query(query, routeId, (error, result) => {
    if (error) { return reject(error); }
    util.sortByDirection(result);
    resolve(result);
  });
});

const getStopsByCoords = (sub) => new Promise((resolve, reject) => {
  let query = 'SELECT * FROM `' +sub+ '_stops` s RIGHT JOIN `' +sub+ '_stop_routes` sr ON s.stop_id = sr.stop_id'
  connection.query(query, (error, result) => {
    if (error) { return reject(error); }
    resolve(result);
  });
});

module.exports = {
  updateSchedule,
  getTimesByStop,
  getTimesByRoute,
  getTimesByStopAndRoute,
  getStops,
  getStop,
  getRoutes,
  getRoute,
  getStopsByRoute,
  getStopsByCoords
};
