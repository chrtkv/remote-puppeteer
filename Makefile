lint:
	npx eslint .

start:
	pm2 start src/server.js \
  --name "puppeteer-server" \
  --max-memory-restart="2G" && pm2 save

restart:
	pm2 restart puppeteer-server --update-env

status:
	pm2 status puppeteer-server

logs:
	pm2 logs puppeteer-server --lines 300

monitor:
	pm2 monit puppeteer-server

stop:
	pm2 stop puppeteer-server
