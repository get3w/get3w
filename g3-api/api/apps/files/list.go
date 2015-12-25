package files

import (
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// List return files
func List(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")
	path := c.P(2)

	appDAO := dao.NewAppDAO()

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	if app.Private && !api.IsSelf(c, app.Owner) {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	files, err := parser.Storage.GetFiles(parser.Storage.GetRootPrefix(path))
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, files)
}
