/**
 * timetrackui.js
 * Created 30 May 2012 by Ross Adamson
 * Copyright 2012 Ross Adamson. All rights reserverd.
 *
 * This is the HTML5 client end of the timetrack application. It allows the user to log work
 * done for various time ranges and has logic for summing time and displaying a report of the logs.
 */

var g_serverUrl = null;
var g_firstEntry = null;
var g_lastEntry = null;
var g_timeFormat = 't';
var g_currentDate = Date.today();
var g_tags = {};
var g_lastLoadFailed = true;
var g_saveSoonTimeout = null;
var g_updateTagInfoSoonTimeout = null;
var g_updateDayTimeSpentSoonTimeout = null;
var g_updateWeekTimeOnNextSaveCounter = 0;

var TABKEY = 9;
var ENTERKEY = 13;

var g_container;
var g_exportDiv;
var g_tagDataDiv;
var g_updateCurrentTimeInterval;
var g_dayTimeSpentDiv;
var g_weekTimeSpentDiv;
var g_consoleDiv;
var g_dateInput;

function TimeEntry() {
}
TimeEntry.prototype = {
    init: function() {
        var instance = this;

        this._tags = {};
        this._includeInTotals = null;

        this.div = document.createElement('div');
        this.div.style['border-bottom'] = '1px solid black';
        this.div.style['margin-bottom'] = '10px';
        this.div.style['padding-top'] = '10px';
        this.div.style['padding-bottom'] = '10px';

        this.timeDiv = document.createElement('div');
        this.timeDiv.style['margin-bottom'] = '10px';
        this.div.appendChild(this.timeDiv);

        this.timeInput = document.createElement('input');
        this.timeInput.type = 'time';
        this.timeInput.onclick = function() {
            this.select();
        }
        this.timeInput.onblur = function(event) {
            if (instance.canSetDateString(this.value, true)) {
                instance.time = parseDateInput(this.value);
            } else {
                instance.updateTimeInput();
            }
        }
        this.timeInput.onkeydown = function(event) {
            if (event.keyCode == ENTERKEY) {
                this.blur();
            }
        }
        this.timeDiv.appendChild(this.timeInput);

        this.deleteButtonNextTimeFixed = document.createElement('button');
        this.deleteButtonNextTimeFixed.type = 'button';
        this.deleteButtonNextTimeFixed.innerHTML = 'Delete without changing next entry\'s start time';
        this.deleteButtonNextTimeFixed.onclick = function() {
            removeEntry(instance, true);
        }
        this.timeDiv.appendChild(this.deleteButtonNextTimeFixed);

        this.deleteButton = document.createElement('button');
        this.deleteButton.type = 'button';
        this.deleteButton.innerHTML = 'Delete';
        this.deleteButton.onclick = function() {
            removeEntry(instance, false);
        }
        this.timeDiv.appendChild(this.deleteButton);

        this.insertButton = document.createElement('button');
        this.insertButton.type = 'button';
        this.insertButton.innerHTML = 'Insert new entry before this';
        this.insertButton.onclick = function() {
            insertNewEntry(instance);
        }
        this.timeDiv.appendChild(this.insertButton);

        this.tagsInput = document.createElement('input');
        this.tagsInput.type = 'text';
        this.tagsInput.onblur = function() {
            instance.tagsString = this.value;
        }
        this.tagsInput.onkeydown = function(event) {
            if (event.keyCode == ENTERKEY) {
                this.blur();
            }
        }
        this.timeDiv.appendChild(this.tagsInput);

        this.includeInTotalsCheckbox = document.createElement('input');
        this.includeInTotalsCheckbox.type = 'checkbox';
        this.includeInTotalsCheckbox.onclick = function() {
            instance.includeInTotals = this.checked;
        }
        this.includeInTotalsCheckbox.onkeyup = function() {
            instance.includeInTotals = this.checked;
        }
        this.timeDiv.appendChild(this.includeInTotalsCheckbox);

        this.logDiv = document.createElement('div');
        this.logDiv.contentEditable = true;
        this.logDiv.onkeydown = function(event) {
            if (event.keyCode == TABKEY && !event.shiftKey && instance.nextEntry == null) {
                addNewEntry();
                event.preventDefault();
            } else {
                saveSoon();
                updateTagInfoSoon();
            }
        }
        this.logDiv.onclick = function() {
            saveSoon();
            updateTagInfoSoon();
        }
        this.logDiv.style['margin-bottom'] = '10px';
        this.div.appendChild(this.logDiv);

        this.totalTimeDiv = document.createElement('div');
        this.totalTimeDiv.className = 'totalTimeDiv';
        this.div.appendChild(this.totalTimeDiv);

        return this;
    },
    set includeInTotals(flag) {
        if (this._includeInTotals != flag) {
            this._includeInTotals = flag;

            saveSoon();
            updateDayTimeSpentSoon();
            updateWeekTimeSoon();
            updateTagInfoSoon();
        }

        this.includeInTotalsCheckbox.checked = this._includeInTotals;

        if (flag) {
            $(this.totalTimeDiv).removeClass('notIncluded');
        } else {
            $(this.totalTimeDiv).addClass('notIncluded');
        }

    },
    get includeInTotals() {
        return this._includeInTotals;
    },
    set tagsArray(tagsArray) {
        var tagsMap = {};

        for (var i = 0; i < tagsArray.length; ++i) {
            var tag = tagsArray[i];

            tagsMap[tag] = tag;
        }

        this.tagsMap = tagsMap;
    },
    get tagsArray() {
        var tags = [];

        for (var tag in this._tags) {
            tags.push(tag);
        }

        return tags;
    },
    set tagsString(tagsString) {
        var tags = tagsString.split(',');

        var newArray = [];
        for (var i = 0; i < tags.length; ++i) {
            var trimmed = $.trim(tags[i]);

            if (trimmed.length != 0) {
                newArray.push(trimmed);
            }
        }
        this.tagsArray = newArray;
    },
    get tagsString() {
        return this.tagsArray.join(',');
    },
    set tagsMap(tagsMap) {
        var tagsArray = this.tagsArray;
        for (var i = 0; i < tagsArray.length; ++i) {
            var tag = tagsArray[i];

            if (!tagsMap.hasOwnProperty(tag)) {
                removeTagEntry(tag, this);
            }
        }

        this._tags = {};

        for (var tag in tagsMap) {
            // Add parent tasks automatically
            var matches = tag.match(/^[a-zA-Z]+-[0-9]{3}/);
            if (matches != null) {
                var match = matches[0];
                this._tags[match] = match;
                addTagEntry(match, this);
            }
            this._tags[tag] = tag;
            addTagEntry(tag, this);
        }

        this.updateTagsInput();
    },
    get tagsMap() {
        return this._tags;
    },
    hasTag: function(tag) {
        return this.tagsMap.hasOwnProperty(tag);
    },
    addTag: function(tag) {
        if (!this._tags.hasOwnProperty(tag)) {
            this._tags[tag] = tag;

            this.updateTagsInput();

            addTagEntry(tag, this);
        }
    },
    removeTag: function(tag) {
        if (this._tags.hasOwnProperty(tag)) {
            delete this._tags[tag];

            this.updateTagsInput();

            removeTagEntry(tag, this);
        }
    },
    updateTagsInput: function() {
        this.tagsInput.value = this.tagsString;
    },
    setNewTime: function() {
        var time;

        if (this.nextEntry != null) {
            time = copyDate(this.nextEntry.time);
        } else {
            time = dateOnCurrentDate(new Date());

            if (this.prevEntry != null && this.prevEntry.time.compareTo(time) > 0) {
                time = copyDate(this.prevEntry.time);
            }
        }

        this.time = time;
    },
    canSetDateString: function(dateString, alertErrors) {
        var date = parseDateInput(dateString);

        var valid = true;

        if (date == null) {
            alertIfTrue(alertErrors, 'Invalid date string');
            valid = false;
        } else {
            valid = this.canSetDate(date, alertErrors);
        }

        return valid;
    },
    canSetDate: function(date, alertErrors) {
        // Check the time is valid

        var valid = false;

        if (date == null) {
            alertIfTrue(alertErrors, 'Invalid date');
        } else if (this.prevEntry != null && this.prevEntry.time.compareTo(date) > 0) {
            alertIfTrue(alertErrors, 'Cannot set time before previous entry began.');
        } else if (this.nextEntry != null && date.compareTo(this.nextEntry.time) > 0) {
            alertIfTrue(alertErrors, 'Cannot set time ahead of next entry');
        } else if (date.compareTo(g_currentDate) < 0) {
            alertIfTrue(alertErrors, 'Cannot set time before current day');
        } else if (date.compareTo(copyDate(g_currentDate).add(1).day()) >= 0) {
            alertIfTrue(alertErrors, 'Cannot set time after current day');
        } else {
            valid = true;
        }

        return valid;
    },
    set time(time) {
        if (this.time != null && this.time.equals(time)) {
            // same as before
        } else {
            this._time = time;

            this.updateTimeSpent();

            if (this.prevEntry != null) {
                this.prevEntry.updateTimeSpent();
            }
        }

        this.updateTimeInput();
    },
    updateTimeInput: function() {
        this.timeInput.value = this._time.toString(g_timeFormat);
    },
    get time() {
        if (this._time) {
            return this._time;
        } else {
            return null;
        }
    },
    updateTimeSpent: function() {
        if (this.time != null) {
            if (this.nextEntry != null && this.nextEntry.time != null) {
                this.timeSpent = this.nextEntry.time - this.time;
            } else if (g_currentDate.equals(Date.today())) {
                this.timeSpent = Math.max(cleanNow() - this.time, 0);
            } else {
                this.timeSpent = copyDate(g_currentDate).add(1).day() - this.time;
            }
        }
    },
    set timeSpent(timeSpent) {
        this._timeSpent = timeSpent;

        this.totalTimeDiv.innerHTML = 'Time spent: ' + msToString(this._timeSpent);

        saveSoon();
        updateDayTimeSpentSoon();
        updateWeekTimeSoon();
        updateTagInfoSoon();
    },
    get timeSpent() {
        return this._timeSpent;
    },
    set nextEntry(nextEntry) {
        this._nextEntry = nextEntry;

        this.updateTimeSpent();
    },
    get nextEntry() {
        if (this._nextEntry) {
            return this._nextEntry;
        } else {
            return null;
        }
    },
    set prevEntry(prevEntry) {
        this._prevEntry = prevEntry;
    },
    get prevEntry() {
        if (this._prevEntry) {
            return this._prevEntry;
        } else {
            return null;
        }
    },
    set description(description) {
        this.logDiv.innerHTML = description;
    },
    get description() {
        return this.logDiv.innerHTML;
    }
}

function Set() {
    this.objects = [];
}
Set.prototype = {
    hasObject: function(obj) {
        for (var i = 0; i < this.objects.length; ++i) {
            if (this.objects[i] === obj) {
                return true;
            }
        }

        return false;
    },
    setObject: function(obj) {
        if (!this.hasObject(obj)) {
            this.objects.push(obj);
        }
    },
    removeObject: function(obj) {
        var index = -1;
        for (i = 0; i < this.objects.length; ++i) {
            if (this.objects[i] === obj) {
                index = i;
                break;
            }
        }

        if (index != -1) {
            this.objects.splice(i, 1);
        }
    },
    toArray: function() {
        return this.objects;
    },
    get length() {
        return this.objects.length;
    }
}

function alertIfTrue(flag, message) {
    if (flag) {
        alert(message);
    }
}

function copyDate(date) {
    if (date == null) {
        return null;
    } else {
        return new Date(date.getTime());
    }
}

function parseDateInput(dateString) {
    return dateOnCurrentDate(Date.parse(dateString));
}

function cleanDate(date) {
    if (date != null) {
        date.setSeconds(0, 0);
    }

    return date;
}

function cleanNow() {
    return cleanDate(new Date());
}

function dateOnCurrentDate(date) {
    if (date != null) {
        var time = { hour: date.getHours(), minute: date.getMinutes() };

        date = cleanDate(copyDate(g_currentDate).at(time));
    }

    return date;
}

function msToString(milliseconds) {
    return secToString(msToSec(milliseconds));
}

function secToString(seconds) {
    var hoursMinutesSeconds;
    if (seconds > 0) {
        hoursMinutesSeconds = remaining.getArray(seconds);
    } else {
        hoursMinutesSeconds = [0, 0, 0];
    }
    var hours = hoursMinutesSeconds[0];
    var minutes = hoursMinutesSeconds[1];
    var seconds = hoursMinutesSeconds[2];

    var string = '';
    if (hours > 0) {
        string += hours + 'h';
    }

    if (string.length != 0) {
        string += ' ';
    }

    if (minutes > 0) {
        string += minutes + 'm';
    } else if (hours == 0) {
        if (seconds > 0) {
            string += '<1m';
        } else {
            string = '0m';
        }
    }

    return string;
}

function msToSec(milliseconds) {
    return milliseconds / 1000;
}

function timeDurationToString(milliseconds) {
    var hours = milliseconds / 1000 / 60
}

function containerClick(event) {
//    if (event.target == g_container) {
//        addNewEntry();
//    }
}

function getLastEntry() {
    return g_lastEntry;
}

function getFirstEntry() {
    return g_firstEntry;
}

function addNewEntry() {
    insertNewEntry(null);
}

function addEntry(entry) {
    insertEntry(entry, null);
}

function insertNewEntry(nextEntry) {
    var entry = new TimeEntry().init();

    insertEntry(entry, nextEntry);

    entry.setNewTime();
    entry.includeInTotals = true;
}

function insertEntry(entry, nextEntry) {
    var prevEntry;

    if (nextEntry == null) {
        prevEntry = getLastEntry();
    } else {
        prevEntry = nextEntry.prevEntry;
    }

    linkEntries(prevEntry, entry);
    linkEntries(entry, nextEntry);

    if (nextEntry == null) {
        makeEntryLast(entry);

        g_container.appendChild(entry.div);

    } else {

        g_container.insertBefore(entry.div, nextEntry.div);

    }

    if (prevEntry == null) {
        makeEntryFirst(entry);
    } else {
        prevEntry.deleteButtonNextTimeFixed.disabled = false;
    }

    entry.timeInput.select();
}

function linkEntries(prev, next) {
    if (prev != null) {
        prev.nextEntry = next;
    }
    if (next != null) {
        next.prevEntry = prev;
    }
}

function makeEntryFirst(entry) {
    entry.prevEntry = null;
    g_firstEntry = entry;
}

function makeEntryLast(entry) {
    entry.nextEntry = null;
    g_lastEntry = entry;

    entry.deleteButtonNextTimeFixed.disabled = true;
}

function resetEntryList() {
    g_firstEntry = g_lastEntry = null;
}

function removeEntry(entry, keepNextTimeFixed) {
    g_container.removeChild(entry.div); 

    if (entry.nextEntry != null) {
        if (entry.prevEntry != null) {
            linkEntries(entry.prevEntry, entry.nextEntry, keepNextTimeFixed);
        } else {
            makeEntryFirst(entry.nextEntry);
        }

        if (!keepNextTimeFixed) {
            entry.nextEntry.time = copyDate(entry.time);
        }

    } else if (entry.prevEntry != null) {

        makeEntryLast(entry.prevEntry);

    } else {
        // No more entries
        resetEntryList();
    }

    entry.tagsMap = {};

    saveSoon();
    updateDayTimeSpentSoon();
    updateWeekTimeSoon();
    updateTagInfoSoon();
}

function updateCurrentTime() {
    var prevEntry = getLastEntry();

    if (prevEntry != null) {
        prevEntry.updateTimeSpent();
    }
}

function exportEntries() {
    var entriesData = [];
    
    var entry = getFirstEntry();
    while (entry != null) {
        if (entry.prevEntry == null && entry.nextEntry == null &&
                entry.description == '' && entry.tagsArray.length == 0) {
            // Only one entry and it is blank
        } else {
            entriesData.push(
                {
                    time: entry.time.getTime(),
                    timeSpent: entry.timeSpent,
                    description: entry.description,
                    tagsArray: entry.tagsArray,
                    includeInTotals: entry.includeInTotals
                }
            )
        }

        entry = entry.nextEntry;
    }

    var data = {};
    data.date = toDateString(g_currentDate);
    data.entries = entriesData;

    return data;
}

function removeAllEntries() {
    var entry = getFirstEntry();
    while (entry != null) {
        removeEntry(entry, false);

        entry = entry.nextEntry;
    }
}

function toDateString(date) {
    return date.toString('yyyy-MM-dd');
}

function saveCurrentDate(makeBackup) {
    if (makeBackup) {
        log('Saving current entries and making a secondary backup...');
    } else {
        log('Saving current entries to server...');
    }

    var promise;

    if (g_lastLoadFailed) {

        promise = {
            success: function(handler) {
                return this;
            },
            error: function(handler) {
                handler({ error: 'Last attempt to load from server failed; not saving until manual load succeeds.' +
                        ' Export current entries to avoid losing unsaved work.' });

                return this;
            }
        }

    } else {
        var promise = saveToServer(makeBackup);
    }

    promise.success(function() {
        log('saved');

        if (g_updateWeekTimeOnNextSaveCounter != 0) {
            g_updateWeekTimeOnNextSaveCounter--;

            updateWeekTime();
        }
    })
    .error(function(error) {
        logError('Error saving: ' + JSON.stringify(error));

        if (g_updateWeekTimeOnNextSaveCounter != 0) {
            g_updateWeekTimeOnNextSaveCounter--;
        }
    });

    return promise;
}

function saveToServer(makeBackup) {

    var data = exportEntries();
    var dataString = JSON.stringify(data);

    var promise = $.post(g_serverUrl + '/date' + (makeBackup ? '/backup' : ''),
            { date: data.date, dataString: dataString });

    return promise;
}

function getStorageName(id) {
    return 'timetracklog_' + id;
}

function loadDate(date, useBackup) {

    var promise = loadDateFromServer(date, useBackup);

    promise.success(function() {
        g_lastLoadFailed = false;

    })
    .error(function(error) {
        g_lastLoadFailed = true;
    });

    return promise;
}

function loadDateFromServer(date, useBackup) {
    if (date == null) {
        return;
    }

    var dateString = toDateString(date);

    log('loading entries for ' + dateString + (useBackup ? ' from backup' : '') + '...');

    var promise = $.get(g_serverUrl + '/date' + (useBackup ? '/backup' : '') + '/' + dateString)
    .success(function(result) {
        log('success loading');

        setCurrentDate(date);

        importEntries(result);

        if (g_currentDate.equals(Date.today()) && getFirstEntry() == null) {
            addNewEntry();
        }
    })
    .error(function(error) {
        logError('Error loading:');
        logError(JSON.stringify(error));
    })

    return promise;
}

function importEntries(data) {

    var entries = data.entries;

    removeAllEntries();

    for (var i = 0; i < entries.length; ++i) {
        var entryData = entries[i];

        var entry = new TimeEntry().init();
        addEntry(entry);
        entry.time = new Date(entryData.time);
        entry.description = entryData.description;
        entry.tagsArray = entryData.tagsArray;
        entry.includeInTotals = entryData.includeInTotals;
    }

    setCurrentDate(Date.parse(data.date));
}

function importEntriesFromJson(json) {
    try {
        var data = JSON.parse(json);

        importEntries(data);

    } catch (exception) {
        logError('Error importing: bad JSON or invalid data');
    }
}

function selectExportDiv() {
    g_exportDiv.focus();
    /*
    if (g_exportDiv.innerHTML != '') {
        var range = document.createRange();
        range.setStart(g_exportDiv, 0);
        range.setEnd(g_exportDiv, g_exportDiv.innerHTML.length);

        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }
    */
}

function addTagEntry(tag, entry) {
    getTagEntries(tag).setObject(entry);

    updateTagInfoSoon();
    saveSoon();
}

function removeTagEntry(tag, entry) {
    getTagEntries(tag).removeObject(entry);

    if (getTagEntries(tag).length == 0) {
        removeTag(tag);
    }

    updateTagInfoSoon();
    saveSoon();
}

function getTagEntries(tag) {
    if (!g_tags.hasOwnProperty(tag)) {
        g_tags[tag] = new Set();
    }

    return g_tags[tag];
}

function removeTag(tag) {
    delete g_tags[tag];
}

function removeAllTags() {
    g_tags = {};
}

function updateTagInfo() {
    var info = '';

    for (var tag in g_tags) {
        var entries = getTagEntries(tag).toArray();

        var tagSum = 0;

        var groups = splitEntriesBySubTask(tag, entries);

        var sections = '';

        for (var subTag in groups) {

            var group = groups[subTag].toArray();
            var groupSum = 0;
            var groupString = '';

            for (var i = 0; i < group.length; ++i) {
                var entry = group[i];
                groupSum += entry.timeSpent;

                if (groupString.search($.trim(entry.description)) == -1) {
                    // Description was not already used

                    if (groupString != '' && $.trim(entry.description) != '') {
                        groupString += '; ';
                    }

                    groupString += $.trim(entry.description);
                }
            }

            
            if (groupString == '') {
                groupString = 'no description';
            }
            
            if (sections != '') {
                sections += ' | ';
            }

            if (subTag.search(/^__unamed__/) != 0) {
                sections += subTag.toUpperCase() + ': ';
            }
            sections += groupString;
            sections += ' [' + msToString(groupSum) + ']';

            tagSum += groupSum;
        }

        info += '<div>' + '<h2 class="tagHeader">' + tag + ': ' + msToString(tagSum) + ' (' + (tagSum / 1000 / 60 / 60).toFixed(2) + 'h)' + '</h2>';
        info += sections;
        info += '</div>';
    }

    g_tagDataDiv.innerHTML = info;

    log('Updated tag info');
}

function splitEntriesBySubTask(parentTag, entries) {
    var tagGroups = {};

    //var unamedCounter = 0;

    for (var i = 0; i < entries.length; ++i) {
        var entry = entries[i];

        var tagsString = entry.tagsString;
        var tag = getSubTask(tagsString);
        if (tag == null) {
            tag = getTask(tagsString);
        }
        if (tag == parentTag) {
            tag = null;
        }
        if (tag == null) {
            tag = '__unamed__' + entry.description + entry.tagsString;//unamedCounter++;
        }
        
        if (!tagGroups.hasOwnProperty(tag)) {
            tagGroups[tag] = new Set();
        }

        tagGroups[tag].setObject(entry);
    }

    return tagGroups;
}

function getSubTask(tagsString) {
    var subTask = tagsString.match(/[a-zA-Z]+-[0-9]{3}\/[0-9]{3}/);
    if (subTask != null) {
        subTask = subTask[0];
    }

    return subTask;
}

function getTask(tagsString) {
    var task = tagsString.match(/[a-zA-Z]+-[0-9]{3}/);
    if (task != null) {
        task = task[0];
    }

    return task;
}

function updateDayTimeSpent() {

    var timeSpent = 0;

    var entry = getFirstEntry();
    while (entry != null) {
        if (entry.includeInTotals) {
            timeSpent += entry.timeSpent;
        }
        entry = entry.nextEntry;
    }

    g_dayTimeSpentDiv.innerHTML = 'Day time spent: ' + msToString(timeSpent);

    log('Updated day time spent');
}

function updateWeekTime() {
    
    log('Updating week time...');

    var promise = $.get(g_serverUrl + '/week/' + toDateString(g_currentDate))
    .success(function(data) {
        var week = JSON.parse(data.week);

        var timeSpent = 0;

        $.each(week, function(index, data) {
            timeSpent += getTimeSpent(data.entries); 
        });

        g_weekTimeSpentDiv.innerHTML = 'Week time spent: ' + msToString(timeSpent);

        log('Week time update successful');
    })
    .error(function(data) {
        logError('Error updating week time');
    });

    return promise;
}

function getTimeSpent(entries) {
    var timeSpent = 0;

    $.each(entries, function(index, entry) {
        if (entry.includeInTotals) {
            timeSpent += entry.timeSpent;
        }
    });

    return timeSpent;
}

function setCurrentDate(date) {
    g_currentDate = beginDay(date);
    updateDateInput();
}

function updateDateInput() {
    g_dateInput.value = g_currentDate.toString('D');
}

function beginDay(date) {
    date.setHours(0, 0, 0, 0);
    return date;
}

function log(message) {
    logMessage(message, 'log');
}

function logError(message) {
    logMessage(message, 'log error');
}

function logMessage(message, className) {
    g_consoleDiv.innerHTML += '<div class="' + className + '">' + message + '</div>';

    g_consoleDiv.scrollTop = 100000000;

    console.log(message);
}

function setServerUrl(url) {
    g_serverUrl = url;

    localStorage.setItem(getStorageName('serverUrl'), url);

    g_serverInput.value = url;
}

function getServerUrl() {
    if (g_serverUrl == null) {
        var url = localStorage.getItem(getStorageName('serverUrl'));

        if (url == null) {
            url = 'http://localhost:8080';
        }

        return url;

    } else {
        return g_serverUrl;
    }
}

function saveSoon() {
    if (g_saveSoonTimeout == null) {
        g_saveSoonTimeout = setTimeout(function() {

            saveCurrentDate(false);

            g_saveSoonTimeout = null;

        // Wait a little bit
        }, 1000 * 2);
    }
}

function updateWeekTimeSoon() {
    g_updateWeekTimeOnNextSaveCounter++;

    saveSoon();
}

function updateTagInfoSoon() {

    if (g_updateTagInfoSoonTimeout != null) {
        clearTimeout(g_updateTagInfoSoonTimeout);
    }

    g_updateTagInfoSoonTimeout = setTimeout(function() {

        updateTagInfo();

        g_updateTagInfoSoonTimeout = null;

    // Wait a little bit
    }, 1000);
}

function updateDayTimeSpentSoon() {
    if (g_updateDayTimeSpentSoonTimeout == null) {
        g_updateDayTimeSpentSoonTimeout = setTimeout(function() {

            updateDayTimeSpent();

            g_updateDayTimeSpentSoonTimeout = null;

        // Wait a couple seconds
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded',
    function() {

        g_consoleDiv = document.createElement('div');
        g_consoleDiv.style['height'] = '100px';
        g_consoleDiv.style['overflow'] = 'auto';
        g_consoleDiv.style['border'] = '1px solid gray';
        document.body.appendChild(g_consoleDiv);

        g_dateInput = document.createElement('input');
        g_dateInput.type = 'date';
        g_dateInput.style['width'] = '200px';
        g_dateInput.onclick = function() {
            this.select();
        }
        g_dateInput.onblur = function(event) {
            var date = Date.parse(this.value);

            // Make a backup before switching
            saveCurrentDate(true);

            loadDate(date, false);
        }
        g_dateInput.onkeydown = function(event) {
            if (event.keyCode == ENTERKEY) {
                this.blur();
            }
        }

        document.body.appendChild(g_dateInput);

        g_serverInput = document.createElement('input');
        g_serverInput.type = 'date';
        g_serverInput.style['width'] = '200px';
        g_serverInput.onclick = function() {
            this.select();
        }
        g_serverInput.onblur = function(event) {
            var url = this.value;
            if (url != g_serverUrl || g_lastLoadFailed) {
                var confirmed = confirm('When you reload from a different server, you will lose any entries that are currently not saved.' +
                    ' Are you sure you want to continue?');

                if (confirmed) {
                    setServerUrl(url);

                    loadDate(g_currentDate, false);
                }
            }
        }
        g_serverInput.onkeydown = function(event) {
            if (event.keyCode == ENTERKEY) {
                this.blur();
            }
        }
        document.body.appendChild(g_serverInput);
        
        g_container = document.createElement('div');
        document.body.appendChild(g_container);

        g_dayTimeSpentDiv = document.createElement('div');
        document.body.appendChild(g_dayTimeSpentDiv);

        g_weekTimeSpentDiv = document.createElement('div');
        document.body.appendChild(g_weekTimeSpentDiv);

        var exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.innerHTML = 'Export Date To Text';
        exportButton.onclick = function() {
            g_exportDiv.innerHTML = JSON.stringify(exportEntries());

            selectExportDiv();
        }
        document.body.appendChild(exportButton);

        var importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.innerHTML = 'Import Date From Text';
        importButton.onclick = function() {
            if (g_exportDiv.innerHTML != '') {
                var confirmed = confirm('Importing will replace the date with the' +
                        ' imported entries. Are you sure you want to continue?');

                if (confirmed) {
                    importEntriesFromJson(g_exportDiv.innerHTML);
                }
            } else {
                alert('Please enter the JSON to import in the text area below');
            }
        }
        document.body.appendChild(importButton);

        var restoreBackupButton = document.createElement('button');
        restoreBackupButton.type = 'button';
        restoreBackupButton.innerHTML = 'Restore Backup Copy';
        restoreBackupButton.onclick = function() {
            var confirmed = confirm('This will replace the current entries. Are you sure' +
                        ' you want to continue?');
            if (confirmed) {	
                loadDate(g_currentDate, true);
            }
        }
        document.body.appendChild(restoreBackupButton);

        var saveBackupButton = document.createElement('button');
        saveBackupButton.type = 'button';
        saveBackupButton.innerHTML = 'Save Backup Copy';
        saveBackupButton.onclick = function() {
            var confirmed = confirm('This will replace the current backed up copy on the server. Are you sure' +
                        ' you want to continue?');
            if (confirmed) {
                saveCurrentDate(true);
            }
        }
        document.body.appendChild(saveBackupButton);

        var clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.innerHTML = 'Clear entries';
        clearButton.onclick = function() {
            if (confirm('Are you sure you want to remove all entries?')) {
                removeAllEntries();
            }
        }
        document.body.appendChild(clearButton);
        
        var saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.innerHTML = 'Save';
        saveButton.onclick = function() {
            saveCurrentDate(false);
        }
        document.body.appendChild(saveButton);

        var newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.innerHTML = 'New Entry';
        newButton.onclick = function() {
            addNewEntry();
        }
        document.body.appendChild(newButton);

        g_exportDiv = document.createElement('div');
        g_exportDiv.contentEditable = true;
        g_exportDiv.style['border'] = '1px solid gray';
        g_exportDiv.onclick = function() {
            selectExportDiv();
        }
        document.body.appendChild(g_exportDiv);

        g_tagDataDiv = document.createElement('div');
        document.body.appendChild(g_tagDataDiv);

        g_container.onclick = containerClick;

        g_updateCurrentTimeInterval = setInterval(updateCurrentTime, 1000 * 60);

        setServerUrl(getServerUrl());

        loadDate(new Date(), false);
    },
    false
)
