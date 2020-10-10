const { resolve } = require('path');
const puppeteer = require('puppeteer');
var write2File = require('./fileops').write2file;
var getCommentsByPost = require('./commentscraper').getCommentsByPost;
var csJson = new Object();
var accountsToProcessPerIteration = 10;
csJson["account_infotimelines"] = [];
csJson["account_comments"] = [];

async function sleep(time) {

    return new Promise((resolve) => setTimeout(resolve, time));
}

async function startBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox'],
        ignoreHTTPSErrors: true
    });
    return browser;
}


async function loadmore(page) {

    const buttons = await page.$$('.l4b0S');
    if (buttons!==undefined && buttons.length>0 && buttons[0] !== undefined) {
        buttons[0].click();
    } else {
        page.evaluate(() => {
            window.scrollTo(0, window.document.body.scrollHeight);
        });
        return true;
    }

}

async function postScrapingEngine(account, browser, context) {
    var userAccount = new Object();
    var timelineMedia = [];
    let page = await context.newPage();
    try {
        await page.goto(`https://www.instagram.com/${account}`, { "waitUntil": "networkidle0", "timeout": 0 });

        var userInfo = await page.evaluate(() => {

            if (window._sharedData !== undefined && window._sharedData.entry_data !== undefined && window._sharedData.entry_data.ProfilePage !== undefined) {
                if (window._sharedData.entry_data.ProfilePage.length > 0) {
                    return window._sharedData.entry_data.ProfilePage[0].graphql.user;
                }
            }
            return undefined;

        });

        if (userInfo !== undefined) {

            userAccount["bio"] = userInfo.biography;
            userAccount["followersCount"] = userInfo.edge_followed_by.count;
            userAccount["followingCount"] = userInfo.edge_follow.count;
            userAccount["fullName"] = userInfo.full_name;
            userAccount["userId"] = userInfo.id;
            userAccount["isVerified"] = userInfo.is_verified;
            userAccount["isPrivate"] = userInfo.is_private;
            userAccount["profilePic"] = userInfo.profile_pic_url;
            userAccount["username"] = userInfo.username;
            userAccount["postsMadeSoFar"] = userInfo.edge_owner_to_timeline_media.count;

            var userTimelineFromWindowObj = userInfo.edge_owner_to_timeline_media.edges.map(el => {
                let nodeObj = el.node;
                var igPost = new Object();
                igPost.postId = nodeObj.id;
                igPost.authorUserId = nodeObj.owner.id;
                if (nodeObj.edge_media_to_caption !== undefined && nodeObj.edge_media_to_caption.edges.length > 0) {
                    igPost.captionText = nodeObj.edge_media_to_caption.edges[0].node.text;
                }
                igPost.postedAt = nodeObj.taken_at_timestamp;
                igPost.shortCode = nodeObj.shortcode;
                switch (nodeObj.__typename) {
                    case "GraphVideo":
                        igPost.type = "video";
                        break;
                    case "GraphSidecar":
                        igPost.type = "carousel";
                        break;
                    case "GraphImage":
                        igPost.type = "image";
                        break;
                };
                igPost.isVideo = nodeObj.is_video;
                if (nodeObj.is_video) {
                    igPost.videoViews = nodeObj.video_view_count;
                }
                igPost.likes = nodeObj.edge_media_preview_like.count;
                igPost.thumbnail = nodeObj.thumbnail_src;
                igPost.comments = nodeObj.edge_media_to_comment.count;
                return igPost;
            });

            timelineMedia.push(...userTimelineFromWindowObj);
            var payloadPostsAggregator = [];
            page.setRequestInterception(true);

            page.on('request', req => {

                let curUrl = req.url();
                if (curUrl.startsWith("https://www.instagram.com/graphql/query")) {
                    // curUrl = decodeURIComponent(curUrl);
                    // curUrl = curUrl.replace('"first":12', '"first":50');
                    // console.log("modified URL :: " + curUrl);
                    req.continue({ url: curUrl, method: "GET" });
                } else {
                    req.continue();
                }
            });

            console.log("going to click on show more posts....");

            await loadmore(page);

            const response = await page.waitForResponse(response => response.url().startsWith("https://www.instagram.com/graphql/query") && response.status() === 200);
            await response.json().then(doc => {
                payloadPostsAggregator = doc.data.user.edge_owner_to_timeline_media.edges;
                payloadPostsAggregator = payloadPostsAggregator.map(el => {
                    var igPost = new Object();
                    let nodeObj = el.node;
                    igPost.postId = nodeObj.id;
                    igPost.authorUserId = nodeObj.owner.id;
                    if (nodeObj.edge_media_to_caption !== undefined && nodeObj.edge_media_to_caption.edges.length > 0) {
                        igPost.captionText = nodeObj.edge_media_to_caption.edges[0].node.text;
                    }

                    switch (nodeObj.__typename) {
                        case "GraphVideo":
                            igPost.type = "video";
                            break;
                        case "GraphSidecar":
                            igPost.type = "carousel";
                            break;
                        case "GraphImage":
                            igPost.type = "image";
                            break;
                    };
                    igPost.postedAt = nodeObj.taken_at_timestamp;
                    igPost.shortCode = nodeObj.shortcode;
                    igPost.isVideo = nodeObj.is_video;
                    if (nodeObj.is_video) {
                        igPost.videoViews = nodeObj.video_view_count;
                    }
                    igPost.likes = nodeObj.edge_media_preview_like.count;
                    igPost.thumbnail = nodeObj.thumbnail_src;
                    igPost.comments = nodeObj.edge_media_to_comment.count;
                    return igPost;
                });
                timelineMedia.push(...payloadPostsAggregator);
                payloadPostsAggregator = [];
            })
                .catch(err => {
                    console.log("err ::==> " + err);
                });

        }

    } catch (error) {
        console.error("error in scraping IgPosts " + error);
    } finally {

        if (timelineMedia !== undefined && timelineMedia.length > 0) {
            console.table(`Account ${account} PostsForWhichCommentsNeeded ${timelineMedia.length}`);
            csJson.account_infotimelines.push({ "userAccount": userAccount, "timelineMedia": timelineMedia });
            page.waitFor(500);
            let shortCodes = timelineMedia.map(el => {
                return el.shortCode;
            });

            if (commentsEnabled.includes(account)) {
                let totalComments = await getCommentsByPost(browser, context, shortCodes, 300, []);
                csJson.account_comments.push(...totalComments);
            }
        }

        if (!page.isClosed()) {
            await page.close();
        }
    }
    return timelineMedia;
}

async function processAllAccounts(fewAccounts, browser, context) { 
    let currentAccount = fewAccounts.shift();
    if(currentAccount!==undefined){
        await postScrapingEngine(currentAccount, browser, context);
        await processAllAccounts(fewAccounts, browser, context);
    }

    return;
}

async function init() {
    let accountsToProcess = [...accountsList];

    if (indexToProcess >= accountsToProcess.length) {
        indexToProcess = 0;
    }
    let nextIndex = indexToProcess + accountsToProcessPerIteration;

    if (nextIndex >= accountsToProcess.length) {
        nextIndex = accountsToProcess.length;
    }
    let fewAccounts = accountsToProcess.slice(indexToProcess,nextIndex);
    console.log(`Picked Up ${fewAccounts.length} Accounts for processing ,the accounts are ${fewAccounts}`);
    var browser = await startBrowser();
    const context = await browser.createIncognitoBrowserContext();
    const instaPage = await context.newPage();
    await instaPage.goto(`https://www.instagram.com/`, { "waitUntil": "networkidle0" });
    await processAllAccounts(fewAccounts, browser, context);
    console.log("Closing Browser....");
    await browser.close();
    write2File(csJson);
    indexToProcess = nextIndex;
    console.log("Sleeping for 5 min after browser is closed Zzzzzz... ");
    await sleep(5 * 60 *1000);

    csJson = new Object();
    csJson["account_infotimelines"] = [];
    csJson["account_comments"] = [];
    
    await init();
    return;
}

let indexToProcess = 0;

var accountsList = ['sachintendulkar'];
var commentsEnabled = ['sachintendulkar'];

init();