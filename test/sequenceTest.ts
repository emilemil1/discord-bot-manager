import Sequence from "../src/util/sequence.js";

async function test() {
    await Sequence("Level 1", async () => {
        await Sequence("Level 2", async () => {
            await Sequence("Level 3").resolve();
        }).resolve();
    }).step("Level 1", () => {
        return;
    }).resolve();
}

try {
    await test();
} catch (err) {
    console.error(err);
}
