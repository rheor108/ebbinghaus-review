import type { Command } from "obsidian";

export function reregisterCommand(
  registered: Command,
  definition: Omit<Command, "name">,
  localizedName: string,
  removeCommand: (commandId: string) => void,
  addCommand: (command: Command) => Command,
): Command {
  removeCommand(registered.id);
  return addCommand({ ...definition, name: localizedName });
}
