package files

import (
	"encoding/base64"
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Get file content
func Get(c *echo.Context) error {
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

	data, err := parser.Storage.Read(parser.Storage.GetSourceKey(path))
	if err != nil {
		return api.ErrorNotFound(c, nil)
	}

	content := base64.StdEncoding.EncodeToString(data)

	output := &get3w.FileGetOutput{
		Content: content,
	}
	return c.JSON(http.StatusOK, output)
}
