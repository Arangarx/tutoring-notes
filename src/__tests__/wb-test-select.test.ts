const { tagsForPaths } = require("../../scripts/wb-test-select.cjs");

describe("wb-test-select student session disclosures", () => {
  it("maps the disclosure and both roster lists to @wb-chrome", () => {
    const files = [
      "src/components/admin/StudentSessionDisclosures.tsx",
      "src/app/admin/students/[id]/whiteboard/ActiveWhiteboardSessionsList.tsx",
      "src/app/admin/students/[id]/whiteboard/EndedUnsavedSessionsList.tsx",
    ];
    for (const file of files) {
      expect(tagsForPaths([file])).toEqual(expect.arrayContaining(["@wb-chrome"]));
    }
  });
});
