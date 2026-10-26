// The photos of an Immich album, for the Photos widget and the screensaver.
//
// Immich v3 removed the `assets` array from GET /api/albums/{id}
// (https://immich.app/blog/v3-migration), so an album's photos are read with
// the paginated metadata search instead, which works on both v2 and v3. Every
// page is read: the display picks its photos at random from the WHOLE album,
// not from its first page. (Stopping after 1,000 left the rest of a larger
// album out for good, however often the widget refreshed.)

// Immich's largest page.
const PAGE_SIZE = 1000;
// A safety stop for a very large album: 50 pages is 50,000 photos.
const MAX_PAGES = 50;

// Asked of every search, for the screensaver's photo details (the date, the
// people, the place: utils/photoDetails.js).
const WITH_DETAILS = Object.freeze({ withExif: true, withPeople: true });

/**
 * `post` once with the details asked for, and once more without them if the
 * server refuses the request: an Immich too old to know the fields still
 * shows its photos, just without details.
 */
async function postWithDetails(post, url, body, options) {
  try {
    return await post(url, { ...body, ...WITH_DETAILS }, options);
  } catch (error) {
    if (error?.response?.status !== 400) throw error;
    return post(url, body, options);
  }
}

/**
 * Every asset in `albumId`, in Immich's order. `post(url, body, options)` is
 * axios.post (injected so tests need no Immich).
 */
async function fetchAlbumAssets({ post, apiBase, headers, albumId, timeout = 15000 }) {
  const assets = [];
  let page = 1;
  for (let pages = 0; page && pages < MAX_PAGES; pages += 1) {
    const response = await postWithDetails(post, `${apiBase}/search/metadata`, { albumIds: [albumId], page, size: PAGE_SIZE }, { headers, timeout });
    const bucket = response.data?.assets || {};
    const items = bucket.items || [];
    assets.push(...items);
    // A page with nothing on it ends the album, whatever nextPage says.
    page = items.length && bucket.nextPage ? Number(bucket.nextPage) : null;
  }
  return assets;
}

module.exports = { PAGE_SIZE, MAX_PAGES, WITH_DETAILS, fetchAlbumAssets, postWithDetails };
