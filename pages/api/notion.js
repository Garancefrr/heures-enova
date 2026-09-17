import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = "3d389ed9-48ee-4ec4-a6f7-3fb5fecc7c7b";

export default async function handler(req, res) {
  // CORS — permet les appels depuis n'importe quel domaine (ou restreindre au tien)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { action, payload } = req.body || {};

    if (action === "query") {
      // Lire les saisies — filtre passé depuis le client
      const response = await notion.databases.query({
        database_id: DB,
        filter: payload.filter || undefined,
        sorts: payload.sorts || [{ property: "Date", direction: "descending" }],
        page_size: payload.limit || 100,
      });
      return res.status(200).json({ results: response.results.map(formatRow) });
    }

    if (action === "create") {
      // Créer une ou plusieurs pages
      const pages = payload.pages || [];
      const created = await Promise.all(
        pages.map((p) =>
          notion.pages.create({
            parent: { database_id: DB },
            properties: buildProperties(p),
          })
        )
      );
      return res.status(200).json({ ok: true, count: created.length });
    }

    if (action === "update") {
      // Mettre à jour une page existante
      const { pageId, properties } = payload;
      await notion.pages.update({
        page_id: pageId,
        properties: buildProperties(properties),
        ...(payload.archived ? { archived: true } : {}),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

// Construire les propriétés Notion depuis un objet simple
function buildProperties(props) {
  const out = {};
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null) continue;

    if (key === "Titre") {
      out["Titre"] = { title: [{ text: { content: String(val) } }] };
    } else if (key === "Collaborateur") {
      // Relation — val = URL de page Notion
      const id = val.split("/").pop().replace(/-/g, "");
      out["Collaborateur"] = { relation: [{ id: formatUUID(id) }] };
    } else if (key === "Type" || key === "Mois" || key === "Statut") {
      out[key] = { select: { name: val } };
    } else if (key === "Date") {
      out["Date"] = { date: { start: val } };
    } else if (key === "Année" || key === "Nb heures sup") {
      out[key] = { number: Number(val) };
    } else if (key === "Nuit") {
      out["Nuit"] = { checkbox: val === true || val === "__YES__" };
    } else if (key === "Détails appels / Motif") {
      out["Détails appels / Motif"] = {
        rich_text: [{ text: { content: String(val || "") } }],
      };
    }
  }
  return out;
}

// Formater une page Notion en objet simple pour le client
function formatRow(page) {
  const p = page.properties;
  const get = (key, type) => {
    const prop = p[key];
    if (!prop) return null;
    if (type === "title") return prop.title?.[0]?.plain_text || "";
    if (type === "select") return prop.select?.name || "";
    if (type === "date") return prop.date?.start || "";
    if (type === "number") return prop.number ?? null;
    if (type === "checkbox") return prop.checkbox ?? false;
    if (type === "rich_text") return prop.rich_text?.[0]?.plain_text || "";
    if (type === "relation") return prop.relation?.[0]?.id || "";
    return null;
  };

  return {
    url: page.id,
    Titre: get("Titre", "title"),
    Type: get("Type", "select"),
    "date:Date:start": get("Date", "date"),
    Mois: get("Mois", "select"),
    Année: get("Année", "number"),
    "Nb heures sup": get("Nb heures sup", "number"),
    Nuit: get("Nuit", "checkbox") ? "__YES__" : "__NO__",
    "Détails appels / Motif": get("Détails appels / Motif", "rich_text"),
    Statut: get("Statut", "select"),
    Collaborateur: get("Collaborateur", "relation"),
  };
}

function formatUUID(id) {
  if (id.includes("-")) return id;
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
}
