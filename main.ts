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

let exponentialBackoff = 0;

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

const keepaliveTimeoutSeconds = {
  start: 0,
  end: 0,
  interval: 0,
};

const ws = new WebSocket(
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false",
);
const onopen = (event) => {
  console.info(`Pusher connection opened: ${JSON.stringify(event)}`);
  exponentialBackoff = 0;
};
const onmessage = async (event) => {
  const data = JSON.parse(event.data);
  if (data.event == "pusher:connection_established") {
    console.info("Pusher connection established!");
    // {"event": "pusher:connection_established","data": "{\"socket_id\":\"214617.19803\",\"activity_timeout\":120}"}
    console.info("pusher:connection_established: " + JSON.stringify(data));
    ws.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `chatrooms.${Deno.env.get("KICK_CHANNEL_ID")}.v2`,
        },
      }),
    );
    ws.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `channel.${Deno.env.get("KICK_CHANNEL_ID")}`,
        },
      }),
    );
  } else if (data.event == "App\\Events\\ChatMessageEvent") {
    // {"event":"App\\Events\\ChatMessageEvent","data":"{\"id\":\"cb4cd57d-926c-4f28-859d-abccca87e119\",\"chatroom_id\":668,\"content\":\"mhm\",\"type\":\"message\",\"created_at\":\"2024-04-25T07:29:14+00:00\",\"sender\":{\"id\":1840624,\"username\":\"Imtoolazytoputaname\",\"slug\":\"imtoolazytoputaname\",\"identity\":{\"color\":\"#E9113C\",\"badges\":[]}}}","channel":"chatrooms.668.v2"}
    const msgEvent = JSON.parse(data.data);
    // {"id":"f3b7c335-71a1-416a-89ba-bbff7082761b","chatroom_id":668,"content":"Stare","type":"message","created_at":"2024-04-25T07:40:21+00:00","sender":{"id":7411666,"username":"iStyl3z","slug":"istyl3z","identity":{"color":"#1475E1","badges":[]}}}
    console.info(
      "pusher:App\\Events\\ChatMessageEvent: " + JSON.stringify(msgEvent),
    );
    const msgId = msgEvent.id;
    //let userId = msgEvent.sender.id;
    const displayName = msgEvent.sender.username;
    const username = msgEvent.sender.slug;
    const nameToPost = displayName.toLowerCase() == username
      ? displayName
      : `${displayName} (${username})`;
    let message = msgEvent.content;
    // Handle Emotes:
    message = message.replace(/\[emote:\d+:(.+)\]/g, "$1");
    const dcChannel = await client.channels.fetch(Deno.env.get("CHANNEL_ID"));
    if (dcChannel) {
      if (dcChannel.isTextBased()) {
        // https://discordjs.guide/message-components/buttons.html
        const deleteBtn = new ButtonBuilder()
          .setCustomId(`delete${msgId}`)
          .setLabel("Delete")
          .setStyle(ButtonStyle.Success);
        const timeoutBtn = new ButtonBuilder()
          .setCustomId(`timeout${username}`)
          .setLabel("Timeout")
          .setStyle(ButtonStyle.Danger);
        const banBtn = new ButtonBuilder()
          .setCustomId(`ban${username}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Danger);
        const _actionRow = new ActionRowBuilder().addComponents(
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
  keepaliveTimeoutSeconds.end = keepaliveTimeoutSeconds.start +
    keepaliveTimeoutSeconds.interval;
};
const onclose = (event) => {
  console.info(
    `Pusher connection closed! (Code: ${event.code}; Reason: ${event.reason})`,
  );
  if (!event.wasClean) {
    console.info(
      `Connection didn't close in a clean manner! Maybe just the connection was lost! Trying to reconnect... (exponential backoff: ${exponentialBackoff})`,
    );
    if (exponentialBackoff == 0) {
      // Run script again
      exponentialBackoff = 100;
    } else {
      setTimeout(() => {
        // Run script again
      }, exponentialBackoff);
    }
    exponentialBackoff *= 2;
  }
};
const onerror = (err) => {
  console.info(`Pusher connection errored: ${err}`);
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
      const id = interaction.customId.substring("delete".length);
      const actionId = Deno.env.get("DELETE_ACTION_ID");
      await doAction(actionId, {
        id: id,
      }).then(() => {
        interaction.reply("Told Streamer.Bot to run the delete action");
      });
    } else if (interaction.customId.startsWith("timeout")) {
      const username = interaction.customId.substring("timeout".length);
      const modal = new ModalBuilder()
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
      const submitted = await interaction
        .awaitModalSubmit({
          filter: (i) =>
            i.customId == "timeoutModal" && i.user.id == interaction.user.id,
          time: 60000,
        })
        .catch((err) => {
          console.error(err);
        });
      if (submitted) {
        const duration = submitted.fields.getTextInputValue("timeoutDuration");
        const reason = submitted.fields.getTextInputValue("timeoutReason");
        const actionId = Deno.env.get("TIMEOUT_ACTION_ID");
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
      const username = interaction.customId.substring("ban".length);
      const modal = new ModalBuilder()
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
      const submitted = await interaction
        .awaitModalSubmit({
          filter: (i) =>
            i.customId == "banModal" && i.user.id == interaction.user.id,
          time: 60000,
        })
        .catch((err) => {
          console.error(err);
        });
      if (submitted) {
        const reason = submitted.fields.getTextInputValue("banReason");
        const actionId = Deno.env.get("BAN_ACTION_ID");
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
if (!Deno.env.get("TOKEN")) {
  console.log(
    "TOKEN not found! You must setup the Discord TOKEN as per the README file before running this bot.",
  );
} else {
  client.login(Deno.env.get("TOKEN"));
}
