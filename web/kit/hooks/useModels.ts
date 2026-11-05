import { useEffect, useState } from "react";
import { Type } from "typebox";
import { Value } from "typebox/value";

const ModelList = Type.Array(Type.String());
let models: Promise<string[]> | undefined;

async function load(): Promise<string[]> {
  try {
    const res = await fetch("models");
    const body: unknown = res.ok ? await res.json() : [];
    return Value.Check(ModelList, body) ? body : [];
  } catch {
    return [];
  }
}

/** The models Pi can run, fetched once per page from the host's models route. */
export function useModels(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    models ??= load();
    void models.then((value) => current && setList(value));
    return () => {
      current = false;
    };
  }, []);
  return list;
}
