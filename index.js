const axios = require("axios");

const TelegramBot = require("node-telegram-bot-api");

const BASE_URL = "https://reservation.nowonsc.kr/";

const GET_STATUS_URL = BASE_URL + "API";

const LOGIN_URL = BASE_URL + "/member/loginAction";

const config = require("./config.json");

if(config.telegram_token === ""){
	console.log("Please set your telegram token in config.json");
	process.exit(1);
}

if(config.telegram_chat_id === ""){
	console.log("Please set your telegram chat id in config.json");
	process.exit(1);
}

const bot = new TelegramBot(config.telegram_token, {polling: true});

const chatId = config.telegram_chat_id;

let loggedIn = false;

let JSESSIONID = "";

const dateList = config.date_list;

const TYPE_PARK = 35;
const TYPE_TERRACE = 36;
const TYPE_HEALING = 37;


// immutable values
const CTYPE = "C";
const KD = "C";

function validateDateFormat(){
	if(dateList.size === 0){
		console.log("dateList is empty");
		process.exit(1);
	}
	for(const date of dateList){
		// check if the date format is yyyy-mm-dd
		if(!date.match(/^\d{4}-\d{2}-\d{2}$/)){
			console.log("Invalid date format: " + date);
			process.exit(1);
		}
	}
}

async function tryLogin(){
	try{
		if(config.id === "" || config.password === ""){
			console.log("Please set your id and password in config.json");
			process.exit(1);
			return;
		}
		const loginData = {
			memberId: config.id,
			memberPassword: config.password,
			save_id: "on"
		};

		const response = await axios.post(LOGIN_URL, loginData, {
			headers: {
				ACCEPT: "application/json, text/javascript, */*; q=0.01",
				HOST: "reservation.nowonsc.kr",
				Origin: "https://reservation.nowonsc.kr",
				Referer: "https://reservation.nowonsc.kr/member/login",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36",
				"X-Requested-With": "XMLHttpRequest"
			}
		});
		// get the JSESSIONID and save it
		JSESSIONID = response.headers["set-cookie"][0].split(";")[0];
		loggedIn = true;
		console.log("Successfully logged in, JSESSIONID: " + JSESSIONID);
	}catch(e){
		console.log("Login failed: Maybe wrong credentials");
		process.exit(1);
	}
}

async function checkReservation(){
	if(!loggedIn){
		throw new Error("Assumed to be logged in");
	}
	if(JSESSIONID === ""){
		throw new Error("JSESSIONID is empty");
	}
	try{
		for(const date of dateList){
			for(let i = TYPE_PARK; i <= TYPE_HEALING; i++){
				try{
					console.log("Trying to get reservation status for " + date + " with camping type " + i);
					const responseData = (await axios.post(GET_STATUS_URL, new URLSearchParams({
						kd: KD,
						ctype: CTYPE,
						cseq: i,
						date: date
					}), {
						headers: {
							Cookie: "JSESSIONID=" + JSESSIONID + "; ids=" + config.id + ";",
							Accept: "application/json, text/javascript, */*; q=0.01",
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36",
							"X-Requested-With": "XMLHttpRequest",
							"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
							"Referer": "https://reservation.nowonsc.kr/leisure/camping_date?cate1=2",
							Connection: "Keep-Alive",
							"Content-Length": 36
						}
					}));
					const response = responseData.data;
					if(response.result === 0){
						for(const siteId in response.list){
							const data = response.list[siteId];
							let siteEngName;
							switch(i){
								case TYPE_PARK:
									siteEngName = "P";
									break;
								case TYPE_TERRACE:
									siteEngName = "T";
									break;
								case TYPE_HEALING:
									siteEngName = "H";
									break;
								default:
									throw new Error("Invalid site type: " + i);
							}
							const realSiteId = siteEngName + (parseInt(siteId) + 1);
							if(data.stat === "N"){
								// 중복 날짜?
							}else if(data.stat === "O"){
								// 이건 뭐지?
							}else if(realSiteId === "T6"){
								// T6은 사용 안함
							}else{
								await bot.sendMessage(config.telegram_chat_id,
									`새로운 예약 가능한 날짜를 발견했어요:\n\n사이트: ${realSiteId}\n날짜: ${date}`);
								console.log("Found new reservation date: " + date + " with site " + realSiteId + " at " + new Date() + ", exiting...");
								process.exit(1);
							}
						}
					}else{
						throw new Error("Failed to get reservation status for " + date + " with camping type " + i);
					}
				}catch(e){
					console.log("Failed to get reservation status for " + date + " with camping type " + i);
					console.error(e);
				}
			}
		}
	}catch(e){
		await tryLogin();
	}
}

async function main(){
	validateDateFormat();
	await tryLogin();
	await checkReservation();
	setInterval(async () => checkReservation(), 1000 * 60); // 1 min interval
}

(async () => main())();
