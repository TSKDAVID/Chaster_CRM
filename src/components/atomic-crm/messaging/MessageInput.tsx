import {
  useState,
  useRef,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { ImagePlus, X } from "lucide-react";

export const MessageInput = ({
  onSend,
  disabled,
}: {
  onSend: (body: string, file?: File | null) => void;
  disabled?: boolean;
}) => {
  const [value, setValue] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = value.trim() || attachedFile;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value, attachedFile);
    setValue("");
    clearAttachment();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
    e.target.value = "";
  };

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(null);
    setPreviewUrl(null);
  };

  return (
    <div className="px-5 py-3 border-t shrink-0">
      {/* Image preview */}
      {previewUrl && (
        <div className="mb-2 relative inline-block">
          <img
            src={previewUrl}
            alt="Attached"
            className="h-24 rounded-lg object-cover border"
          />
          <button
            onClick={clearAttachment}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-80"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 rounded-full border px-4 py-1 bg-background focus-within:ring-1 focus-within:ring-ring">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
          title="Attach photo"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={attachedFile ? "Add a caption..." : "Message..."}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm outline-none py-2 placeholder:text-muted-foreground"
        />
        {canSend && (
          <button
            onClick={handleSend}
            className="text-primary font-semibold text-sm hover:opacity-70 transition-opacity shrink-0"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
};
