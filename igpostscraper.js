const puppeteer = require('puppeteer');
var write2File = require('../routes/testWrte').write2file;
var getCommentsByPost = require('../scrapers/commentscraper').getCommentsByPost;
var csJson = new Object();
var postsAccumulator = [];
csJson["account_infotimelines"] = [];
csJson["account_comments"] = [];
var totalComments;
var ownerInfo;


async function startBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox'],
        ignoreHTTPSErrors: true
    });
    return browser;
}

async function closeBrowser(browser) {
    console.log("browser closed");
    browser.close();
}

async function loadmore(page) {

    const buttons = await page.$$('.l4b0S');
    if (buttons[0] != undefined) {
        buttons[0].click();
    }

    if (postsAccumulator.length >= 24) {
        return true;
    } else {
        // loadmore(page);
    }
}

async function postScrapingEngine(account, browser, context) {

    var userAccount = new Object();
    var timelineMedia = [];
    const page = await context.newPage();
    try {
        await page.goto(`https://www.instagram.com/${account}`, { "waitUntil": "networkidle0" });
    } catch (error) {
        page.close();
        console.log("error while loading page" + error);
    }

    let userInfo = await page.evaluate(() => {
        return window._sharedData.entry_data.ProfilePage[0].graphql.user;
    });


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
        var igAccount = new Object();
        igAccount.postId = nodeObj.id;
        igAccount.ownerId = nodeObj.owner.id;
        igAccount.authorUsername = nodeObj.owner.username;
        if (nodeObj.edge_media_to_caption !== undefined && nodeObj.edge_media_to_caption.edges.length > 0) {
            igAccount.postText = nodeObj.edge_media_to_caption.edges[0].node.text;
        }
        igAccount.createdAt = nodeObj.taken_at_timestamp;
        igAccount.mediaShortCode = nodeObj.shortcode;
        igAccount.isVideo = nodeObj.is_video;
        igAccount.likes = nodeObj.edge_media_preview_like.count;
        igAccount.postURL = nodeObj.display_url;
        igAccount.comments = nodeObj.edge_media_to_comment.count;
        return igAccount;
    });
    
    timelineMedia.push(...userTimelineFromWindowObj);
    var payloadPostsAggregator = [];
    page.setRequestInterception(true);

    page.on('request', req => {
        var curUrl = req.url();

        if (curUrl.startsWith("https://www.instagram.com/graphql/query")) {

            curUrl = decodeURIComponent(curUrl);
            curUrl = curUrl.replace('"first":12', '"first":50');
            console.log("modified URL :: " + curUrl);
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
            var igAccount = new Object();
            let nodeObj = el.node;
            igAccount.postId = nodeObj.id;
            igAccount.ownerId = nodeObj.owner.id;
            igAccount.authorUsername = nodeObj.owner.username;
            if (nodeObj.edge_media_to_caption !== undefined && nodeObj.edge_media_to_caption.edges.length > 0) {
                igAccount.postText = nodeObj.edge_media_to_caption.edges[0].node.text;
            }
            igAccount.createdAt = nodeObj.taken_at_timestamp;
            igAccount.mediaShortCode = nodeObj.shortcode;
            igAccount.isVideo = nodeObj.is_video;
            igAccount.likes = nodeObj.edge_media_preview_like.count;
            igAccount.postURL = nodeObj.display_url;
            igAccount.comments = nodeObj.edge_media_to_comment.count;
            return igAccount;
        });
        timelineMedia.push(...payloadPostsAggregator);
        payloadPostsAggregator = [];
    })
        .catch(err => {
            console.log("err ::==> " + err);
        });

    console.log(`Total Posts Accumulated For ${account} is ${timelineMedia.length} `);
    csJson.account_infotimelines.push({ "userAccount": userAccount, "timelineMedia": timelineMedia });
    page.waitFor(500);
    let comments = await getCommentsByPost(browser,context,"CFWxFC-AsCw",300);
    csJson.account_comments.push(comments);
    write2File(csJson);
    page.close();
    return timelineMedia;
}

async function init() {
    var browser = await startBrowser();
    const context = await browser.createIncognitoBrowserContext();

    const instaPage = await context.newPage();
    await instaPage.goto(`https://www.instagram.com/`, { "waitUntil": "networkidle0" });

    await postScrapingEngine("net_ad", browser, context);
}

init();