"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { mockStudentOptions } from "@/lib/schedule/mock-data";
import { CalendarPlusIcon } from "lucide-react";

type CreateSessionDialogProps = {
  /** Pre-fill date when opened from calendar day click */
  defaultDate?: string;
  trigger?: React.ReactNode;
};

export function CreateSessionDialog({ defaultDate, trigger }: CreateSessionDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" className="min-h-11">
            <CalendarPlusIcon aria-hidden />
            New session
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-[10px]">
        <DialogHeader>
          <DialogTitle className="heading text-xl font-normal">Schedule session</DialogTitle>
          <DialogDescription>
            Visual preview only — saving does not persist. Session length is soft planning
            metadata; recording ends when you end the session.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="schedule-student">Student</Label>
            <Select defaultValue={mockStudentOptions[0]}>
              <SelectTrigger id="schedule-student" className="min-h-11 w-full">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {mockStudentOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-subject">Subject</Label>
            <Input id="schedule-subject" placeholder="e.g. Algebra II" className="min-h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                defaultValue={defaultDate}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-duration">Planned length</Label>
              <Select defaultValue="60">
                <SelectTrigger id="schedule-duration" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">~45 min (soft)</SelectItem>
                  <SelectItem value="60">~60 min (soft)</SelectItem>
                  <SelectItem value="90">~90 min (soft)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-start">Start time</Label>
              <Input id="schedule-start" type="time" defaultValue="16:00" className="min-h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-end">End time</Label>
              <Input id="schedule-end" type="time" defaultValue="17:00" className="min-h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-notes">Notes (optional)</Label>
            <Textarea
              id="schedule-notes"
              placeholder="Homework to review, topics to cover…"
              rows={3}
            />
          </div>

          <p className="rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            When a calendar is connected, this session would push to your external calendar
            after save. Sync status appears on each event.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save session</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
