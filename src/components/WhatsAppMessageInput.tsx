import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface WhatsAppMessageInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

const WhatsAppMessageInput = ({ onSend, disabled }: WhatsAppMessageInputProps) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex gap-2 mt-4 pt-4 border-t">
      <Input
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Digite uma mensagem..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={disabled}
      />
      <Button
        onClick={handleSend}
        disabled={sending || !message.trim() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default WhatsAppMessageInput;
