lint:
	npx eslint . && npx tsc

start:
	pm2 start ecosystem.config.cjs && pm2 save

restart:
	pm2 restart puppeteer-server --update-env

status:
	pm2 status puppeteer-server

log:
	pm2 logs puppeteer-server --lines 300

monitor:
	pm2 monit puppeteer-server

stop:
	pm2 stop puppeteer-server
