import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRecordingOutbox, type OutboxEntry } from "../attachments/recording-outbox";
import { OversizeRecordings } from "./OversizeRecordings";

const entry: OutboxEntry = { id: "big", blob: new Blob(["x"]), mime: "audio/mp4", durationMs: 5, x: 0, y: 0, createdAt: 1 };

describe("OversizeRecordings", () => {
  it("downloads on Save and removes the outbox copy only when the user taps Done", async () => {
    const outbox = new MemoryRecordingOutbox();
    await outbox.put(entry);
    const download = vi.fn();
    const onRemoved = vi.fn();
    render(<OversizeRecordings entries={[entry]} outbox={outbox} onRemoved={onRemoved} download={download} />);
    fireEvent.click(screen.getByRole("button", { name: "Save recording to device" }));
    expect(download).toHaveBeenCalledWith(entry.blob, expect.stringMatching(/\.m4a$/));
    expect(await outbox.list()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith("big"));
    expect(await outbox.list()).toHaveLength(0);
  });

  it("Discard asks first and keeps the recording when the user says no", async () => {
    const outbox = new MemoryRecordingOutbox();
    await outbox.put(entry);
    const onRemoved = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OversizeRecordings entries={[entry]} outbox={outbox} onRemoved={onRemoved} download={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard recording" }));
    expect(confirm).toHaveBeenCalled();
    expect(await outbox.list()).toHaveLength(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard recording" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith("big"));
    expect(await outbox.list()).toHaveLength(0);
    confirm.mockRestore();
  });
});
