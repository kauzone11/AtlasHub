import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";

const MAX_SIZE = 3 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRealImage(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (mime === "image/webp") return Buffer.from(bytes.slice(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString("ascii") === "WEBP";
  return false;
}

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) throw new HubApiError("Selecione uma imagem.", 422);
  if (!ALLOWED.has(file.type)) throw new HubApiError("Envie uma imagem JPG, PNG ou WEBP.", 422);
  if (file.size <= 0 || file.size > MAX_SIZE) throw new HubApiError("A imagem deve ter no máximo 3 MB.", 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isRealImage(bytes, file.type)) throw new HubApiError("O conteúdo do arquivo não corresponde a uma imagem válida.", 422);
  const avatarUrl = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
  await prisma.hubMember.update({ where: { id: session.memberId }, data: { avatarUrl } });
  return hubJson({ avatarUrl });
});
