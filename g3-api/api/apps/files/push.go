package files

import (
	"encoding/base64"
	"net/http"
	"time"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/ioutils"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

// Push file content
func Push(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.FilesPushInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil || !api.IsSelf(c, app.Owner) {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	bs, err := base64.StdEncoding.DecodeString(input.Blob)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	pathBytesMap, err := ioutils.UnPack(bs)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	for _, addedPath := range input.Added {
		parser.Storage.Write(parser.Storage.GetSourceKey(addedPath), pathBytesMap[addedPath])
	}
	for _, modifiedPath := range input.Modified {
		parser.Storage.Write(parser.Storage.GetSourceKey(modifiedPath), pathBytesMap[modifiedPath])
	}
	for _, removedPath := range input.Removed {
		parser.Storage.Delete(parser.Storage.GetSourceKey(removedPath))
	}

	lastModified := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, lastModified)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FileEditOutput{
		LastModified: lastModified,
	}
	return c.JSON(http.StatusOK, output)
}
