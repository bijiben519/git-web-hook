var async = require('async');
var nconf = require('nconf');
var winston = require('winston');
var express = require('express');
var exec = require('child_process').exec;
var utils = require('./utils');

var PULL_TIMEOUT_MS = 1000 * 60 * 20; // 20 minutes
var DEPLOY_TIMEOUT_MS = 1000 * 60 * 20; // 20 minutes
var MAX_OUTPUT_BYTES = 524288; // 512 KB

// Load config settings
nconf
  .argv({ f: { alias: 'config', describe: 'configuration file' } })
  .env();
if (nconf.get('help'))
  return console.log('Usage: gitdeploy [-f config.json]');
if (nconf.get('config'))
  nconf.file('system', nconf.get('config'));
nconf
  .file('user', __dirname + '/config.local.json')
  .file('base', __dirname + '/config.json');
// Make sure we have permission to bind to the requested port
if (nconf.get('web_port') < 1024 && process.getuid() !== 0)
  throw new Error('Binding to ports less than 1024 requires root privileges');

// 创建一个 Winston 日志记录器
const logger = winston.createLogger({
  level: nconf.get('log_level') || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.splat(),
    winston.format.simple(),
    winston.format.printf(({ level, message, label, timestamp }) => {
      return `${level}【${timestamp}】${label || ''}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: nconf.get('log_path') || 'app.log' })
  ]
});


var app = express();
// 解析 application/json 类型的请求体
app.use(express.json());
// 解析 application/x-www-form-urlencoded 类型的请求体
app.use(express.urlencoded({ extended: false }));
// 日志记录中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});
// Load the request handler
app.post('/webhook', postHook);
// Setup error handling/logging
app.all('*', utils.handle404);
app.use(utils.requestErrorLogger(logger));
app.use(utils.handle500);
// Start listening for requests
app.listen(nconf.get('web_port'), listeningHandler);


function listeningHandler() {
  logger.info('gitdeploy is listening on port %d ', nconf.get('web_port'));
}

function postHook(req, res, next) {
  const payload = req.body;

  if (!payload.repository)
    return next('Unrecognized payload: ' + JSON.stringify(req.body.payload));

  // Get the URL of the repository that this ping is about
  var repoUrl = payload.repository.url;
  if (!repoUrl)
    return next('Unknown repository url in payload: ' + req.body.payload);

  // get push branch
  let pushBranch = '';
  const pushRef = payload.ref;
  if (pushRef) {
    const arr = pushRef.split('/');
    if (arr.length > 2) {
      pushBranch = arr.slice(2).join('/');
    }
  }

  logger.info('Received a ping for repository ' + repoUrl + ' from ' + req.ip);
  logger.debug('payload=' + req.body.payload);

  // Get the list of configured repositories
  var repos = nconf.get('repositories');
  if (!repos)
    return res.send('OK');

  // Find configured repositories that match the current repo ping
  repos = repos.filter(function(repo) { return repo.url === repoUrl; });
  if (!repos.length)
    return res.send('OK');

  // Update/deploy each configured repository matching the current ping
  async.eachSeries(repos.map(repo => ({ ...repo, pushBranch })), updateRepo,
    function(err) {
      if (err)
        logger.error(err);
      else
        logger.info('Finished updating all repositories');
    }
  );

  res.send('OK');
}


function updateRepo(repo, callback) {
  exec(`cd ${repo.path}`, function(err) {
    return callback('path dose not exist!');
  });

  checkBranch(() => {
    logger.info('Updating repository ' + repo.path);

    if (repo.reset) {
      exec('git reset --hard HEAD', function(err, stdout, stderr) {
        if (err) return callback('git reset --hard HEAD in ' + repo.path + ' failed: ' + err);

        logger.debug('[git reset] ' + stdout.trim() + '\n' + stderr.trim());
        logger.info('Reset repository ' + repo.url + ' -> ' + repo.path);

        gitPull();
      });
    } else {
      gitPull();
    }
  });

  function checkBranch(then) {
    logger.info('check repository branch:' + repo.pushBranch);

    const cmd = `current_branch=$(git branch --show-current)
    webhook_branch="${repo.pushBranch}"
    
    if [ "$current_branch" = "$webhook_branch" ]; then
        echo "当前分支和 Web Hook 分支匹配"
    else
        exit 1
    fi
    `;

    exec(cmd, function(err, stdout, stderr) {
      if (err) return callback('check branch failed: 当前分支和 Web Hook 分支不匹配');

      logger.info('check branch: ' + stdout.trim() + '\n' + stderr.trim());
      then();
    });
  }

  function gitPull() {
    exec('git pull', function(err, stdout, stderr) {
      if (err) return callback('git pull in ' + repo.path + ' failed: ' + err);

      logger.debug('[git pull] ' + stdout.trim() + '\n' + stderr.trim());
      logger.info('Updated repository ' + repo.url + ' -> ' + repo.path);

      if (!repo.deploy)
        return callback();

      logger.info('Running deployment "' + repo.deploy + '"');
      exec(repo.deploy, function(err, stdout, stderr) {
        if (err)
          return callback('Deploy "' + repo.deploy + '" failed: ' + err);

        // Merge stderr output into stdout
        stdout = (stdout || '').trim();
        if (stderr)
          stdout += '\n' + stderr.trim();

        logger.debug('[' + repo.deploy + '] ' + stdout);
        logger.info('Finished deployment "' + repo.deploy + '"');

        callback();
      });
    });
  }
}
