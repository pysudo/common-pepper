const logger = require("../../../utils/logger");
const fs = require("fs");
const path = require("path");


const DB_PATH = path.join(
  __dirname,
  `tasks-db${(process.env.NODE_ENV !== "test" ? "" : ".test")}.json`
);


(function DBInit() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([{}], null, 2));
    }
  }
  catch (err) { console.error(err); }
})();


const say = {
  help: "Say something at every interval on a particular channel.",
  usage: `${process.env.PREFIX}say <message> every <h>:<m>:<s> on <channel> ` +
    "named <task-name>",
  modify: `${process.env.PREFIX}say modify say|on|every|named ` +
    "<message>|<h>:<m>:<s>|<channel>|<task-name>",
  example: `${process.env.PREFIX}say my repeat message every 02:5:30 on ` +
    "pogTV named some-name",
  message: "Message to be repeated for every specified interval.",
  channel: "Channel in which the bot says the specified message " +
    "every set interval.",
  "task-name": "Unique name for the task.",
  /**
   * Sends a bot response for on specified particular channel and set interval.
   * @memberof say
   * @method exec
   * @param {Array<string>} request
   * @param {string} context
   * @returns {string}
   */
  exec: function(context, request) {
    if (request.join(" ") === "clear task list") {
      fs.writeFileSync(DB_PATH, JSON.stringify([{}], null, 2));
      return "The task list has been wiped clean.";
    }
    if (request[0] === "modify") {
      return this.modifyTask(request.splice(1));
    }
    /*
      A sample message such as "this is a test message every 1:0:0 on channel
      named task-name" is spliced as follows:
      *----------------------------------------------------------------------*
      |         request           |                 meta                     |
      |----------------------------------------------------------------------|
      |   this is a test message  |  every 1:0:0 on channel named task-name  |
      *----------------------------------------------------------------------*
     */
    const meta = request.splice(request.length - 6);
    if (
      request.length === 0
      || meta[0] !== "every"
      || meta[meta.length - 4] !== "on"
      || meta[meta.length - 2] !== "named"
    ) {
      return this.usage;
    }

    const [, every, , on, , taskName] = meta;

    const regexNotMatch = this
      .checkRegexNotMatch({ every, on, named: taskName });
    if (regexNotMatch) return regexNotMatch;


    const intervalInSeconds = this.parseSeconds(every);
    if (!intervalInSeconds) return "Please enter a valid interval.";

    const newTask = {
      totalWaitInterval: intervalInSeconds,
      channel: on.toLowerCase(),
      taskMessage: request.join(" ")
    };

    return this.updateTaskList(taskName, "create", newTask);
  },

  /**
  * Update or remove specified task name.
  * @param {Array<string>} request List containing task name and its
  * corresponding modification arguments.
  */
  modifyTask: function(request) {
    const taskName = request.splice(0, 1);

    if (request.length === 1 && ["remove", "delete"].includes(request[0])) {
      return this.updateTaskList(taskName, "delete");
    }

    if (
      request.length === 1
      || !["say", "every", "on", "named"].includes(request[0])
    ) {
      return this.modify;
    }

    const modifiedTask = {};
    const [modifyType] = request.splice(0, 1);

    if (modifyType !== "say" && request.length === 1) {
      const regexNotMatch = this
        .checkRegexNotMatch({ [modifyType]: request[0] });
      if (regexNotMatch) return regexNotMatch;
    }

    switch (modifyType) {
      case "say":
        modifiedTask.taskMessage = request.join(" ");
        break;
      case "every":
        modifiedTask.totalWaitInterval = this.parseSeconds(request[0]);
        break;
      case "on":
        modifiedTask.channel = request[0].toLowerCase();
        break;
      case "named":
        modifiedTask["named"] = request[0];
        break;
    }

    return this.updateTaskList(taskName, "modify", modifiedTask);
  },

  /**
  * Updates the existing task list.
  * @param {String} taskName Name of the task.
  * @param {("create" | "modify" | "delete")} type Operation to be performed on
  * the on the current task list.
  * @param {Object} updatedTask A task instance.
  */
  updateTaskList: function(taskName, type, updatedTask) {
    try {
      const db = fs.readFileSync(DB_PATH);
      const JSONfile = JSON.parse(db);

      if (!this.validateJSON(JSONfile, ((type === "modify" ? taskName : "")))) {
        return "Invalid Task List.";
      }
      const [tasks] = JSONfile;

      let returnedValue;
      switch (type) {
        case "create":
          returnedValue = `Task ${taskName} activated on channel ` +
            `${updatedTask.channel}.`;

          if (tasks[taskName]) {
            return `Task with name '${taskName}' already exists.`;
          }

          tasks[taskName] = updatedTask;

          break;
        case "modify":
          returnedValue = `Task ${taskName} successfully modified.`;
          if (!tasks[taskName]) {
            return `The task '${taskName}' does not exists.`;
          }

          if (Object.keys(updatedTask).includes("named")) {
            if (taskName !== updatedTask["named"]) {
              tasks[updatedTask["named"]] = tasks[taskName];
              delete tasks[taskName]; // Deletes old task name
            }
          }
          else {
            const old = tasks[taskName];
            const modified = { ...old, ...updatedTask };
            tasks[taskName] = modified;
          }

          break;
        case "delete":
          returnedValue = `Task ${taskName} successfully removed.`;
          if (!tasks[taskName]) {
            return `The task '${taskName}' does not exists.`;
          }
          delete tasks[taskName];

          break;
      }

      fs.writeFileSync(DB_PATH, JSON.stringify([tasks], null, 4));

      return returnedValue;
    }
    catch (err) {
      if (err instanceof SyntaxError) {
        console.error(err.message + " for the file in path: " + DB_PATH);
      }
      else if (err.code && err.code === "ENOENT") {
        console.error(err.message);
      }
      else {
        console.error(err);
      }

      return false;
    }
  },
  /**
   *
   * @param {Array} toMatch
   * @param {string} type
   * @returns
   */
  checkRegexNotMatch: function(toMatch) {
    for (const type in toMatch) {
      switch (type) {
        case "every":
          if (!toMatch[type].match(/^\d+$|^(\d+:){1,2}(\d+)$/)) {
            return "Interval should be in h:m:s or m:s or s format.";
          }

          break;
        case "on":
          if (!toMatch[type].match(/^[a-zA-Z0-9_]{4,25}$/)) {
            return "Username should only contain alphanumeric and underscores, "
              + "ranging from 4-25 characters only.";
          }

          break;
        case "named":
          if (!toMatch[type].match(/^[a-zA-Z0-9_-]{3,40}$/)) {
            return "Task names should only contain alphanumerics, hyphens "
              + "and underscores, ranging from 3-50 characters only.";
          }

          break;
      }
    }
    return false;
  },
  /**
   * Converts the interval from ':' delimited string format to seconds.
   * @param {string} interval
   * - Restricted combination of `hours`, `minutes` and `seconds` time units
   * delimited with a `:` (colon) in a specific order.
   * - The formats are allowed to arranged in any of the following order:
   *    - `h:m:s`
   *    - `m:s`
   *    - `s`
   *
   * ```js
   * const inSeconds = parseSeconds("24:00:00"); // In h:m:s format
   * console.log("inSeconds"); // prints 86400
   *
   * // OR
   *
   * const inSeconds = parseSeconds("60:00"); // In m:s format
   * console.log("inSeconds"); // prints 3600
   * ```
   * @returns {number} returns an integer representing seconds.
   */
  parseSeconds: function(interval) {
    const timeParts = interval.split(":")
      .map(timePart => parseInt(timePart));

    const hms = {};
    switch (timeParts.length) {
      case 1:
        ({ 0: hms.seconds } = timeParts);

        break;
      case 2:
        ({ 0: hms.minutes, 1: hms.seconds } = timeParts);

        break;
      case 3:
        (
          {
            0: hms.hours,
            1: hms.minutes,
            2: hms.seconds
          } = timeParts
        );

        break;
    }

    // Negative time parts are handled by regex.
    const { hours, minutes, seconds } = hms;
    const epox = (new Date()).getTime();
    if (
      (seconds && (new Date(epox + seconds)).toString() === "Invalid Date")
      || (
        minutes
        && (new Date(epox + (minutes * 60))).toString() === "Invalid Date")
      || (
        hours
        && (new Date(epox + (hours * 60 * 60))).toString() === "Invalid Date"
      )
    ) return 0;

    let intervalInSeconds = 0;
    if (seconds) { intervalInSeconds += seconds; }
    if (minutes) { intervalInSeconds += (minutes * 60); }
    if (hours) { intervalInSeconds += (hours * 60 * 60); }

    if (((new Date(intervalInSeconds)).toString() === "Invalid Date")) return 0;

    return intervalInSeconds;
  },
  /**
   * Validates local JSON database for any invalid structures.
   * @example An example of a both a valid JSON parsing database along with
   * proper structure:
   * ```js
   * [
   *     {
   *         "<task_name>": {
   *             "totalWaitInterval": "<total_time_in_seconds>",
   *             "channel": "<channel_name>",
   *             "taskMessage": "<message>"
   *         }...
   *     }
   * ]
   * ```
   * @param {Object} db
   * - Parsed JSON file.
   * - Set the value to be an empty string - `""`, if it's not to be validated.
   * @param {String} taskName Name of the task for task specific validation.
   */
  validateJSON: function(db, taskName = "") {
    const properJSONStructure = "A valid JSON structure should be of the " +
      "format:\n[\n\t{\n\t\t\"<task name>\": {\n\t\t\t\"totalWaitInterval\"" +
      ": <total_time_in_seconds>,\n\t\t\t\"channel\": \"<channel_name>\"," +
      "\n\t\t\t\"taskMessage\": \"<message>\"\n\t\t}\n\t\t\"<another task " +
      "name>\": {\n\t\t\t...\n\t\t}...\n\t}\n]";

    const taskList = /^(\[{(("[a-zA-Z0-9_-]{3,40}":{("totalWaitInterval":\d+,"channel":"[a-zA-Z0-9_]{4,25}","taskMessage":"(([^"]|(\\"))*)")},){0,}("[a-zA-Z0-9_-]{3,40}":{("totalWaitInterval":\d+,"channel":"[a-zA-Z0-9_]{4,25}","taskMessage":"(([^"]|(\\"))*)")}))*}\])$/;

    if (JSON.stringify(db).match(taskList)) return true;

    if (taskName) {
      const [tasks] = db;
      if (tasks[taskName] && Object.keys(tasks[taskName]).length !== 3) {
        console.error(
          "\n\x1b[31m%s\x1b[0m",
          `Unnecessary/missing attribute for the task '${taskName[0]}':`
        );
        console.error("\n\x1b[31m%s\x1b[0m", tasks[taskName]);
        logger.info();
      }
    }
    logger.info("\x1b[34m%s\x1b[0m", properJSONStructure);
    return false;
  }
};


module.exports = { say, DB_PATH };
