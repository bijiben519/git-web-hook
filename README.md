# git-web-hook

# description
An Express-based service is developed to primarily offer an API to support Git web hook usage. The purpose is to enable automatic deployment of the service.

# usage
You can modify the configuration items in either `config.json` or `config.local.json` files. By placing `config.local.json` on the local server, you can override the global configuration.

## configuration


* web_port： The server port.

* log_level：Logging verbosity. Valid values are debug, info, warn, and error. Defaults to debug

* repositories: The list of repositories to be monitored.

    * url：The Git repository link.

    * path：The local repository path on the server.

    * reset：Whether to perform a git reset before executing git pull，The default value is false.

    * deploy：The deploy command executed after git pull can be either a direct shell command or the execution of a shell script.

# deploy
```
node index.js
```
An alternative approach would be to utilize pm2 for launching the deploy script located within the project.
```
./deploy.sh
```