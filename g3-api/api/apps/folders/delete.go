package folders

import (
	"net/http"
	"time"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Delete folder
func Delete(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.FolderDeleteInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}
	if input.Path == "" {
		return api.ErrorBadRequest(c, nil)
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

	parser.Storage.DeleteFolder(parser.Storage.GetSourcePrefix(input.Path))

	lastModified := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, lastModified)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FolderDeleteOutput{
		LastModified: lastModified,
	}
	return c.JSON(http.StatusOK, output)
}
