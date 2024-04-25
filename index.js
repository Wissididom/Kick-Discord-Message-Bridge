import "dotenv/config";
import * as kickApi from "api-kick";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import WebSocket from "ws";

let exponentialBackoff = 0;

const user = await kickApi.getUser(process.env.KICK_CHANNEL_SLUG);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [
    Partials.User,
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
  ],
}); // Discord Object

let keepaliveTimeoutSeconds = {
  start: 0,
  end: 0,
  interval: 0,
};
let keepaliveTimeoutInterval = setInterval(() => {
  if (keepaliveTimeoutSeconds.start > 0 && keepaliveTimeoutSeconds.end > 0) {
    if (keepaliveTimeoutSeconds.end - keepaliveTimeoutSeconds.start > 10)
      script.run(runRequest);
  }
}, 1000);
let ws = new WebSocket(
  "wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false",
);
let onopen = (event) => {
  console.info("Pusher connection opened!");
  exponentialBackoff = 0;
};
let onmessage = async (event) => {
  let data = JSON.parse(event.data);
  if (data.event == "pusher:connection_established") {
    console.info("Pusher connection established!");
    // {"event": "pusher:connection_established","data": "{\"socket_id\":\"214617.19803\",\"activity_timeout\":120}"}
    console.info("pusher:connection_established: " + JSON.stringify(data));
    ws.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `chatrooms.${user.id}.v2`,
        },
      }),
    );
    ws.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `channel.${user.id}`,
        },
      }),
    );
  } else if (data.event == "App\\Events\\ChatMessageEvent") {
    // {"event":"App\\Events\\ChatMessageEvent","data":"{\"id\":\"cb4cd57d-926c-4f28-859d-abccca87e119\",\"chatroom_id\":668,\"content\":\"mhm\",\"type\":\"message\",\"created_at\":\"2024-04-25T07:29:14+00:00\",\"sender\":{\"id\":1840624,\"username\":\"Imtoolazytoputaname\",\"slug\":\"imtoolazytoputaname\",\"identity\":{\"color\":\"#E9113C\",\"badges\":[]}}}","channel":"chatrooms.668.v2"}
    let msgEvent = JSON.parse(data.data);
    // {"id":"f3b7c335-71a1-416a-89ba-bbff7082761b","chatroom_id":668,"content":"Stare","type":"message","created_at":"2024-04-25T07:40:21+00:00","sender":{"id":7411666,"username":"iStyl3z","slug":"istyl3z","identity":{"color":"#1475E1","badges":[]}}}
    console.info(
      "pusher:App\\Events\\ChatMessageEvent: " + JSON.stringify(msgEvent),
    );
    let msgId = msgEvent.id;
    //let userId = msgEvent.sender.id;
    let displayName = msgEvent.sender.username;
    let username = msgEvent.sender.slug;
    let nameToPost =
      displayName.toLowerCase() == username
        ? displayName
        : `${displayName} (${username})`;
    let message = msgEvent.content;
    // Handle Emotes:
    message = message.replace(/\[emote:\d+:(.+)\]/g, "$1");
    let dcChannel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (dcChannel) {
      if (dcChannel.isTextBased()) {
        // https://discordjs.guide/message-components/buttons.html
        let deleteBtn = new ButtonBuilder()
          .setCustomId(`delete${msgId}`)
          .setLabel("Delete")
          .setStyle(ButtonStyle.Success);
        let timeoutBtn = new ButtonBuilder()
          .setCustomId(`timeout${username}`)
          .setLabel("Timeout")
          .setStyle(ButtonStyle.Danger);
        let banBtn = new ButtonBuilder()
          .setCustomId(`ban${username}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Danger);
        let actionRow = new ActionRowBuilder().addComponents(
          deleteBtn,
          timeoutBtn,
          banBtn,
        );
        dcChannel.send({
          content: `\`\`${nameToPost}\`\`: \`\`${message}\`\``,
          components: [
            /*actionRow*/
          ],
        });
      }
    }
  } else {
    console.info("Pusher Data: " + JSON.stringify(data));
  }
  keepaliveTimeoutSeconds.start = Date.now() / 1000;
  keepaliveTimeoutSeconds.end =
    keepaliveTimeoutSeconds.start + keepaliveTimeoutSeconds.interval;
};
let onclose = (event) => {
  console.info(
    `Pusher connection closed! (Code: ${event.code}; Reason: ${event.reason})`,
  );
  if (!event.wasClean) {
    console.info(
      `Connection didn't close in a clean manner! Maybe just the connection was lost! Trying to reconnect... (exponential backoff: ${exponentialBackoff})`,
    );
    if (exponentialBackoff == 0) {
      script.run(runRequest);
      exponentialBackoff = 100;
    } else {
      setTimeout(() => {
        script.run(runRequest);
      }, exponentialBackoff);
    }
    exponentialBackoff *= 2;
  }
};
let onerror = (event) => {
  console.info(`Pusher connection errored!`);
};
ws.onopen = onopen;
ws.onmessage = onmessage;
ws.onclose = onclose;
ws.onerror = onerror;

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild?.available) return;
  if (!interaction.guildId) return;
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("delete")) {
      let id = interaction.customId.substring("delete".length);
      let actionId = process.env["DELETE_ACTION_ID"];
      await doAction(actionId, {
        id: id,
      }).then(() => {
        interaction.reply("Told Streamer.Bot to run the delete action");
      });
    } else if (interaction.customId.startsWith("timeout")) {
      let username = interaction.customId.substring("timeout".length);
      let modal = new ModalBuilder()
        .setTitle("Timeout User")
        .setCustomId("timeoutModal")
        .setComponents(
          new ActionRowBuilder().setComponents(
            new TextInputBuilder()
              .setCustomId("timeoutDuration")
              .setLabel("Timeout Duration in Seconds")
              .setMaxLength(10)
              .setMinLength(1)
              .setPlaceholder("Timeout Duration in Seconds")
              .setStyle(TextInputStyle.Short),
          ),
          new ActionRowBuilder().setComponents(
            new TextInputBuilder()
              .setCustomId("timeoutReason")
              .setLabel("Timeout Reason")
              .setRequired(false)
              .setPlaceholder("Timeout Reason")
              .setStyle(TextInputStyle.Paragraph),
          ),
        );
      await interaction.showModal(modal);
      let submitted = await interaction
        .awaitModalSubmit({
          filter: (i) =>
            i.customId == "timeoutModal" && i.user.id == interaction.user.id,
          time: 60000,
        })
        .catch((err) => {
          console.error(err);
        });
      if (submitted) {
        let duration = submitted.fields.getTextInputValue("timeoutDuration");
        let reason = submitted.fields.getTextInputValue("timeoutReason");
        let actionId = process.env["TIMEOUT_ACTION_ID"];
        if (reason == undefined || reason == null || reason.trim() == "") {
          await doAction(actionId, {
            username: username,
            duration: duration,
          }).then(() => {
            submitted.reply("Told Streamer.Bot to run the timeout action");
          });
        } else {
          await doAction(actionId, {
            username: username,
            duration: duration,
            reason: reason,
          }).then(() => {
            submitted.reply("Told Streamer.Bot to run the timeout action");
          });
        }
      }
    } else if (interaction.customId.startsWith("ban")) {
      let username = interaction.customId.substring("ban".length);
      let modal = new ModalBuilder()
        .setTitle("Ban User")
        .setCustomId("banModal")
        .setComponents(
          new ActionRowBuilder().setComponents(
            new TextInputBuilder()
              .setCustomId("banReason")
              .setLabel("Ban Reason")
              .setRequired(false)
              .setPlaceholder("Ban Reason")
              .setStyle(TextInputStyle.Paragraph),
          ),
        );
      await interaction.showModal(modal);
      let submitted = await interaction
        .awaitModalSubmit({
          filter: (i) =>
            i.customId == "banModal" && i.user.id == interaction.user.id,
          time: 60000,
        })
        .catch((err) => {
          console.error(err);
        });
      if (submitted) {
        let reason = submitted.fields.getTextInputValue("banReason");
        let actionId = process.env["BAN_ACTION_ID"];
        if (reason == undefined || reason == null || reason.trim() == "") {
          await doAction(actionId, {
            username: username,
          }).then(() => {
            submitted.reply("Told Streamer.Bot to run the ban action");
          });
        } else {
          await doAction(actionId, {
            username: username,
            reason: reason,
          }).then(() => {
            submitted.reply("Told Streamer.Bot to run the ban action");
          });
        }
      }
    }
  }
});

// Bot Login
if (!process.env.TOKEN) {
  console.log(
    "TOKEN not found! You must setup the Discord TOKEN as per the README file before running this bot.",
  );
} else {
  client.login(process.env.TOKEN);
}
