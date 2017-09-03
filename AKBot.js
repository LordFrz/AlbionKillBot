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

const auth = require('./auth.json');
const config = require('./config.json');

// Global list of used kill IDs
// Will eventually be switched to a database
let killList;

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

      Albion.getEventDetails(eventID, (err, event) => {
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

        const killerPercent = Math.round((killerDamage / totalDamage) * 100);
        if (killerPercent == "NaN")
        {
          killerPercent = 100;
        }
        
        bot.sendMessage({
          to: config.Channel,
          embed: {
            title: `${event.Killer.Name} of ${event.Killer.GuildName}`,
            description: [
              `**Victim**: ${event.Victim.Name}`,
              `**KillFame**: ${event.TotalVictimKillFame}`,
              `**VictimAlliance**: ${event.Victim.AllianceName}`,
              `**VictimGuild**: ${event.Victim.GuildName}`,
              `**DamageDone**: ${killerPercent}%`,
              `**Assists**: ${assists}`,
            ].join('\n'),
            url: `https://albiononline.com/en/killboard/kill/${event.EventId}`,
            thumbnail: { url: imgUrl },
          }
        });
      })
    });
  });
}

bot.on('message', (user, userID, channelID, message) => {
  if (message.substring(0, 1) !== '!') { return; }

  const args = message.substring(1).split(' ');
  const cmd = args[0];

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
    case 'akCmd':
    case 'akCommands':
    case 'akHelp':
      bot.sendMessage({
        to: channelID,
        message: [
          'List of commands',
          '----------------',
          '!akCmd - List commands',
          '!akCommands - List commands',
          '!akHelp - List commands',
          '!akPurgeList - Clears list of all posted events',
          '!akStatus - Show server status',
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
  }
});
