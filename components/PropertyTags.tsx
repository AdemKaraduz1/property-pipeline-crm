"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PropertyTagsProps = {
  propertyId: string;
};

type Tag = {
  id: string;
  tag: string;
};

const suggestedTags = [
  "Mobility Area",
  "Fixer Upper",
  "Turnkey",
  "High Rehab Risk",
  "Good Section 8 Candidate",
  "Strong Rent Potential",
  "Needs Follow-Up",
  "Visited",
  "Offer Candidate",
];

export function PropertyTags({ propertyId }: PropertyTagsProps) {
    const supabase = createClient();
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadTags() {
    const { data, error } = await supabase
      .from("property_tags")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setTags((data || []) as Tag[]);
  }

  useEffect(() => {
    loadTags();
  }, [propertyId]);

  async function addTag(tagValue: string) {
    const cleanedTag = tagValue.trim();

    if (!cleanedTag) return;

    const alreadyExists = tags.some(
      (existingTag) =>
        existingTag.tag.toLowerCase() === cleanedTag.toLowerCase()
    );

    if (alreadyExists) {
      setNewTag("");
      return;
    }

    const { error } = await supabase.from("property_tags").insert({
      property_id: propertyId,
      tag: cleanedTag,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setNewTag("");
    await loadTags();
  }

  async function deleteTag(tagId: string) {
    const { error } = await supabase
      .from("property_tags")
      .delete()
      .eq("id", tagId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadTags();
  }

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-950">Tags</h3>
        <p className="text-sm text-slate-500">
          Label this deal for quick filtering and decision-making.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <p className="text-sm text-slate-500">No tags yet.</p>
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => deleteTag(tag.id)}
              className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm text-slate-800 hover:bg-red-50 hover:text-red-700"
              title="Click to remove"
            >
              {tag.tag} ×
            </button>
          ))
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <Input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder="Add custom tag"
        />

        <Button type="button" onClick={() => addTag(newTag)}>
          Add Tag
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Suggested Tags
        </p>

        <div className="flex flex-wrap gap-2">
          {suggestedTags.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}