/*
* Author: Mineva of The Priest Academy
* Thanks: to https://medium.com/@renesansz/tutorial-creating-a-simple-discord-bot-9465a2764dc0 for discord tutorial.
* Credits: to http://psykzz.com/albion-api/ for the albion API
* Using: Discord.io and running with Node.js
*/
const Albion = require('albion-api');
const Discord = require('discord.io');
const fs = require('fs');
const logger = require('winston');
const request = require('request');
const auth = require('./auth.json');
const config = require('./config.json');

// Global list of used kill IDs
// Will eventually be switched to a database
let killList;
let battleList;

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { colorize: true });
logger.level = 'debug';

// Read eventID file to get a list of all posted events
// If this fails, we cannot continue, so throw an exception.
fs.readFile('eventID.json', 'utf8', (err, data) => {
  if (err) { throw err; }
  killList = JSON.parse(data);
});

fs.readFile('battleID.json', 'utf8', (err, data) => {
  if (err) { throw err; }
  battleList = JSON.parse(data);
});

// Initialize Discord Bot
const bot = new Discord.Client({
  token: auth.token,
  autorun: true
});

bot.on('ready', () => {
  logger.info('Connected');
  logger.info(`Logged in as: ${bot.username} - (${bot.id})`);

  //Initial check for kills
  checkKillboard();

  //Runs Kill post function every 60seconds
  setInterval(checkKillboard, 60000);
  
  
});
function urlRequest(uri, cb) {
var url = `https://gameinfo.albiononline.com/api/gameinfo/${uri}`;
  request(url, function (error, response, body) {
    cb(null, JSON.parse(body));
  });
}


function checkKillboard() {
	Albion.getRecentEvents({ limit: 51, offset: 0 }, (err, events) => {

	events.forEach(event => {
	  const eventID = event.EventId;
	  if (event.Killer.AllianceName !== config.AllianceTAG
		  || killList.kills.indexOf(eventID) !== -1) {
		return;
	  }

	  killList.kills.push(eventID);
	  fs.writeFile('eventID.json', JSON.stringify(killList), 'utf8', (err) => {
		if (err) { logger.error(`Error writing to file: ${err}`) }
	  });
	  //Run the post event function
	  if(event.TotalVictimKillFame === 0)
	  {
		  return;
	  }else{
		  postEvent(eventID);
	  }
	  
	});
	});
  //Check the battle board for battles
	urlRequest(`battles?limit=51&sort=recent`, (err, battles) => {
		battles.forEach(battle => {
			const battleID = battle.id;
			if(battleList.battles.indexOf(battleID) !== -1
				|| battle.alliances.hasOwnProperty(config.AllianceKey)!== true)
			{
				return;
			}
			battleList.battles.push(battleID);
			fs.writeFile('battleID.json', JSON.stringify(battleList), 'utf8', (err) => {
				if (err) { logger.error(`Error writing to file: ${err}`) }
			});
			if(battle.totalFame === 0){
				return;
			}else{
				postBattle(battleID);
			}
		});
	});
}
function postBattle(battleID)
{
	urlRequest(`battles/${battleID}`, (err, battle) => {
		const tag = config.AllianceKey;
        bot.sendMessage({
          to: config.Channel,
          embed: {
            title: `Battle Report`,
            description: [
		          `**Kills**: ${battle.alliances[tag].kills}`,
		          `**Deaths**: ${battle.alliances[tag].deaths}`,
		          `**KillFame**: ${battle.alliances[tag].killFame}`,
            ].join('\n'),
	    fields: [{
		name: "Battle Size",
		value: [
			`**Participants**: ${Object.keys(battle.players).length}`,
			`**Guilds**: ${Object.keys(battle.guilds).length}`,
			`**TotalDeaths**: ${battle.totalKills}`,
			`**TotalFame**: ${battle.totalFame}`,
		].join('\n'),
	    }],	
            url: `https://albiononline.com/en/killboard/battles/${battleID}`,
          }
        });
			
	});
}
bot.on('message', (user, userID, channelID, message) => {
  if (message.substring(0, 1) !== '!') { return; }

  let args = message.substring(1).split(' ');
  let cmd = args[0];

  args = args.slice(1);

  switch(cmd) {
    case 'akStatus':
      Albion.getServerStatus((err, res) => {
        bot.sendMessage({
          to: channelID,
          message: `Albion server is ${res.live.status}`,
        });
      });
      break;
    case 'akHelp':
      bot.sendMessage({
        to: channelID,
        message: [
          'List of commands',
          '----------------',
          '!akHelp - List commands',
          '!akPurgeList - Clears list of all posted events',
          '!akStatus - Show server status',
		  '!akPK (kill ID) - Show specific kill. Ex(!akPK 9876543)'
        ].join('\n')
      });
      break;
    case 'akPurgeList':
      killList.splice(0, killList.length);
      fs.writeFile('eventID.json', JSON.stringify(killList), 'utf8', () => { });
      bot.sendMessage({
        to: channelID,
        message: 'All EventIDs cleared from file.'
      });
      break;
	  case 'akPK':
		const eventID = args[0];
		postEvent(eventID);
	  
	  break;
  }
});
function postEvent(eventID)
{
      Albion.getEventDetails(eventID, (err, event) => {
	let sym = "%";
        const weapon = event.Killer.Equipment.MainHand;
        const imgUrl = [
          `https://gameinfo.albiononline.com/api/gameinfo/items/`,
          `${weapon.Type}.png`,
          `?count=${weapon.Count}`,
          `&quality=${weapon.Quality}`
        ].join('');

        const participants = parseInt(event.numberOfParticipants, 10);
        const assists = participants - 1;
	if (assists < 0)
	{
		assists = 0;
	}
		
        let killerDamage;
        const totalDamage = event.Participants.reduce((damage, participant) => {
          if (participant.Name === event.Killer.Name) {
            killerDamage = participant.DamageDone;
          }
          return damage + participant.DamageDone;
        }, 0);

        let killerPercent = Math.round((killerDamage / totalDamage) * 100);
	if (isNaN(killerPercent))
	{
		killerPercent = "EXECUTED";
		sym = "";
	}else{sym = "%";}
		
		
        bot.sendMessage({
          to: config.Channel,
          embed: {
            title: `${event.Killer.Name} of ${event.Killer.GuildName}`,
            description: [
              `**Victim**: ${event.Victim.Name}`,
              `**KillFame**: ${event.TotalVictimKillFame}`,
              `**VictimAlliance**: ${event.Victim.AllianceName}`,
              `**VictimGuild**: ${event.Victim.GuildName}`,
              `**DamageDone**: ${killerPercent} ${sym}`,
              `**Assists**: ${assists}`,
            ].join('\n'),
            url: `https://albiononline.com/en/killboard/kill/${event.EventId}`,
            thumbnail: { url: imgUrl },
			//fields: [{
						//name: "Healer",
						//value: "Healer and their stats go here."
				    //}],
          }
        });
      });
}
