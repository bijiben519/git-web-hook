const express = require('express');
const { exec } = require('child_process');

const app = express();
const port = 8888;

app.post('/webhook', (req, res) => {
  const { dir, task } = req.query;

  if (!dir || !task) {
    return res.status(400).send('缺少必要的参数');
  }

  exec(`cd /root/own/${dir} && git pull && pm2 restart ${task}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`执行重新部署命令时出错：${error}`);
      return res.status(500).send('重新部署失败');
    }
    console.log(`重新部署成功：${stdout}`);
    res.status(200).send('重新部署成功');
  });
});

app.listen(port, () => {
  console.log(`Webhook服务器正在监听端口 ${port}`);
});
