/**
 * @name Insulter
 * @author Ahlawat (patched by shyy)
 * @version 1.3.0
 * @description Adds a simple insult command. Works without BunnyLib. Use `/insult` or `!insult` in chat. Add `send` after to actually send (e.g. `/insult send`).
 * @source https://github.com/Tharki-God/BetterDiscordPlugins (original)
 */

module.exports = (() => {
  const config = {
    info: {
      name: "Insulter",
      authors: [{ name: "Ahlawat", discord_id: "1025214794766221384" }],
      version: "1.3.0",
      description: "Adds an insult command. Works without BunnyLib.",
      github: "https://github.com/Tharki-God/BetterDiscordPlugins",
    },
    main: "Insulter.plugin.js",
  };

  const RequiredLib = {
    window: "ZeresPluginLibrary",
    filename: "0PluginLibrary.plugin.js",
    downloadUrl: "https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js",
  };

  class MissingLibrary {
    load() {
      if (!window[RequiredLib.window])
        BdApi.showConfirmationModal(
          "Library Missing",
          `The library plugin (${RequiredLib.window}) needed for ${config.info.name} is missing. Click Download Now to install it.`,
          {
            confirmText: "Download Now",
            cancelText: "Cancel",
            onConfirm: () => {
              require("electron").shell.openExternal(RequiredLib.downloadUrl);
            },
          }
        );
    }
    start() {}
    stop() {}
  }

  return window[RequiredLib.window]
    ? (([Plugin, ZLibrary]) => {
        const { WebpackModules, Patcher, Logger, PluginUpdater } = ZLibrary;
        const MessageActions = WebpackModules.getByProps("sendMessage", "editMessage");
        const UserStore = WebpackModules.getByProps("getCurrentUser");

        return class InsulterPlugin extends Plugin {
          constructor() {
            super();
            this.patchId = "Insulter-patch-sendMessage";
          }

          checkForUpdates() {
            try {
              PluginUpdater.checkForUpdate(
                config.info.name,
                config.info.version,
                config.info.github_raw
              );
            } catch (err) {
              // ignore updater failures
              Logger.err("Updater error", err);
            }
          }

          start() {
            this.checkForUpdates();
            this.patchSendMessage();
          }

          stop() {
            Patcher.unpatchAll(this.patchId);
          }

          patchSendMessage() {
            if (!MessageActions || !MessageActions.sendMessage) return;

            Patcher.before(this.patchId, MessageActions, "sendMessage", (thisObject, args) => {
              try {
                // args: (channelId, message)
                const channelId = args[0];
                const message = args[1];
                if (!message || !message.content) return;
                const content = message.content.trim();

                // Recognize both /insult and !insult (simple fallback when slash-commands aren't available)
                const match = content.match(/^(?:\/|!)insult(?:\s+(.+))?/i);
                if (!match) return; // not our command

                // Prevent the original message from being sent
                args[1] = Object.assign({}, message, { content: "", tts: false });

                const arg = (match[1] || "").toLowerCase();
                const shouldSend = arg.includes("send");

                // fetch insult and either send as the user (if shouldSend) or fake-receive it
                this.getInsult()
                  .then((insult) => {
                    if (!insult) {
                      this._replyFailure(channelId);
                      return;
                    }

                    if (shouldSend) {
                      // send as the user (this will show up as their message)
                      MessageActions.sendMessage(channelId, { content: insult });
                    } else {
                      // fake a received message from a bot-like author
                      const fake = this._makeFakeMessage(channelId, insult);
                      // use receiveMessage if available, otherwise sendMessage as a bot
                      if (MessageActions.receiveMessage) {
                        MessageActions.receiveMessage(channelId, fake);
                      } else {
                        MessageActions.sendMessage(channelId, { content: insult });
                      }
                    }
                  })
                  .catch((err) => {
                    Logger.err(err);
                    this._replyFailure(channelId);
                  });

                // Block original send by returning early from before patch (we already cleared content)
              } catch (err) {
                Logger.err(err);
              }
            });
          }

          _replyFailure(channelId) {
            try {
              MessageActions.sendMessage(channelId, { content: "Unable to get any insult for you, idiot." });
            } catch (err) {
              Logger.err("Failed to send failure message", err);
            }
          }

          _makeFakeMessage(channelId, content) {
            const user = UserStore.getCurrentUser();
            // Minimal shape similar to a message object the app expects
            return {
              id: Date.now().toString(),
              channel_id: channelId,
              content,
              author: {
                id: user.id,
                username: "Insulter",
                discriminator: "0000",
                avatar: null,
                bot: true,
              },
              timestamp: new Date().toISOString(),
              nonce: Date.now().toString(),
              type: 0,
            };
          }

          async getInsult() {
            try {
              const res = await fetch("https://insult.mattbas.org/api/insult");
              if (!res.ok) return;
              return await res.text();
            } catch (e) {
              Logger.err(e);
            }
          }
        };
      })(window.ZeresPluginLibrary.buildPlugin(config))
    : MissingLibrary;
})();
