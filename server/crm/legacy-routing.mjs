// Compatibility for bookmarks, privacy URLs and the webhook already saved in Meta.
export default {
 async fetch(request, env) {
  const target = new URL(env.TARGET_ORIGIN);
  const url = new URL(request.url);
  url.protocol=target.protocol;
  url.host=target.host;
  if(env.MODE==='proxy')return env.TARGET.fetch(new Request(url.href,request));
  return Response.redirect(url.href,308);
 }
};
