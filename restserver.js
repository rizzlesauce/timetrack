/**
 * restserver.js
 * Created 30 May 2012 by Ross Adamson
 * Copyright 2012 Ross Adamson. All rights reserverd.
 *
 * This is a node.js application that serves as the REST backend server
 * for the timetrack application. It mainly saves and loads data from the
 * file system.
 */

var fs = require('fs');

function include(file) {
    with (global) {
        eval(fs.readFileSync(file) + '');
    }
}

function getDateString(date) {
    return date.toString('yyyy-MM-dd');
}

function getDateFilename(dateString, backup) {
    return 'data/' + dateString + '.dat' + (backup ? '.backup' : '');
}

function getEntriesForDate(dateString, useBackup) {
    var filename = getDateFilename(dateString, useBackup);

    try {
        var data = fs.readFileSync(filename, 'utf8');

        return JSON.parse(data);

    } catch (exception) {

        return { date: dateString, entries: [], saved: false };
    }
}

function getEntriesForWeek(date) {
    var weekBeginDate = date.saturday().addDays(-7);

    var currentDate = weekBeginDate;

    var week = [];

    for (var i = 0; i < 7; ++i) {
        var dateString = getDateString(currentDate);

        week.push(getEntriesForDate(dateString, false));

        currentDate.addDays(1);
    }

    return week;
}

include('date.js');

var journey = require('journey');

var router = new(journey.Router);

router.map(function() {
    this.root.bind(function(request, response) {
        response.send('Welcome');
    });

    this.get(/^date\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/).bind(function (request, response, dateString) {

        response.send(getEntriesForDate(dateString, false));
    });

    this.get(/^date\/backup\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/).bind(function (request, response, dateString) {

        response.send(getEntriesForDate(dateString, true));
    });

    this.post(/^date$/).bind(function (request, response, data) {

        var filename = getDateFilename(data.date, false);

        fs.writeFileSync(filename, data.dataString);

        response.send(200);
    });

    this.post(/^date\/backup$/).bind(function (request, response, data) {

        fs.writeFileSync(getDateFilename(data.date, false), data.dataString);
        fs.writeFileSync(getDateFilename(data.date, true), data.dataString);

        response.send(200);
    });


    this.get(/^week\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/).bind(function (request, response, dateString) {

        var week = getEntriesForWeek(Date.parse(dateString));

        response.send({ week: JSON.stringify(week) });
    });
});

require('http').createServer(function (request, response) {
    var body = '';

    request.addListener('data', function(chunk) { body += chunk });
    request.addListener('end', function() {
        router.handle(request, body, function(result) {
            result.headers['Access-Control-Allow-Origin'] = '*';
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });

}).listen(8080);
